/**
 * 'api/scripts': Scripts API to POST run script
 */

const fs = require('fs');
const path = require('path');
var express = require("express");
const authJwt = require('../jwt-helper');
const axios = require('axios');
const { sanitizeAiSource, findUnsupportedSystemFunctions } = require('./ai-output');
var runtime;
var secureFnc;
var checkGroupsFnc;

const JAVASCRIPT_SYSTEM_FUNCTIONS = {
    server: [
        '$getTag(tagId)', '$setTag(tagId, value)', '$getTagId(tagName, deviceName?)',
        '$getTagDaqSettings(tagId)', '$setTagDaqSettings(tagId, settings)',
        '$setView(viewName, force?)', '$setViewBackground(cssColor)',
        '$setControlBackground(controlNameOrId, cssColor)',
        '$enableDevice(deviceName, enabled)', '$getDevice(deviceName)',
        '$getDeviceProperty(deviceName)', '$setDeviceProperty(deviceName, property)',
        '$getHistoricalTags(tagIds, fromTimestamp, toTimestamp)',
        '$sendMessage(to, subject, message)', '$getAlarms()',
        '$getAlarmsHistory(fromDate, toDate)', '$ackAlarm(alarmName, types?)'
    ],
    client: [
        '$getTag(tagId)', '$setTag(tagId, value)', '$getTagId(tagName, deviceName?)',
        '$getTagDaqSettings(tagId)', '$setTagDaqSettings(tagId, settings)',
        '$setView(viewName, force?)', '$setViewBackground(cssColor)',
        '$setControlBackground(controlNameOrId, cssColor)',
        '$openCard(viewName, options?)', '$enableDevice(deviceName, enabled)',
        '$getDeviceProperty(deviceName)', '$setDeviceProperty(deviceName, property)',
        '$setAdapterToDevice(adapterName, deviceName)', '$resolveAdapterTagId(tagId)',
        '$invokeObject(controlName, methodName, ...params)', '$getObject(controlName)',
        '$runServerScript(scriptName, ...params)',
        '$getHistoricalTags(tagIds, fromTimestamp, toTimestamp)',
        '$sendMessage(to, subject, message)', '$getAlarms()',
        '$getAlarmsHistory(fromDate, toDate)', '$ackAlarm(alarmName, types?)'
    ]
};

function getJavaScriptFunctionNames(mode) {
    return JAVASCRIPT_SYSTEM_FUNCTIONS[String(mode || '').toLowerCase() === 'client' ? 'client' : 'server']
        .map(signature => signature.slice(0, signature.indexOf('(')));
}

function collectProjectTags() {
    const devices = runtime.project.getDevices() || {};
    const tags = [];
    Object.values(devices).forEach(device => {
        Object.values(device.tags || {}).forEach(tag => tags.push({
            id: tag.id,
            name: tag.name,
            type: tag.type,
            device: device.name,
            access: tag.access
        }));
    });
    return tags;
}

async function collectProjectScriptContext(permission) {
    const project = await runtime.project.getProject(null, permission);
    const views = project?.hmi?.views || [];
    return {
        views: views.map(view => ({id: view.id, name: view.name})),
        controls: views.flatMap(view => Object.values(view.items || {}).map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            view: view.name
        }))),
        scripts: Object.values(project?.scripts || {}).map(script => ({
            name: script.name,
            mode: script.mode,
            language: script.language || 'javascript'
        }))
    };
}

function getAiSystemPrompt(language, mode) {
    if (language === "javascript") {
        const normalizedMode = String(mode || '').toLowerCase() === "client" ? "client" : "server";
        const executionContext = normalizedMode === "client"
            ? "The script runs in the browser (client mode)."
            : "The script runs on the FUXA server (server mode).";
        const supportedFunctions = JAVASCRIPT_SYSTEM_FUNCTIONS[normalizedMode]
            .map(signature => `- ${signature}`)
            .join('\n');
        return `You write JavaScript script bodies for FUXA industrial control.
Return JavaScript source only, without markdown fences or a surrounding function declaration.
${executionContext}

STRICT SYSTEM FUNCTION WHITELIST FOR THIS MODE:
${supportedFunctions}

You may call only the listed $-prefixed functions. Never invent, infer or simulate another $ function.
If the request cannot be implemented with this whitelist, return a JavaScript comment explaining which capability is unavailable; do not fabricate an API.
Use exact tag IDs, control names/IDs, view names and script names supplied in the project context.
Use await for asynchronous read/query/configuration/message functions.
For requests to change the current view, window or editor canvas background, call $setViewBackground with a CSS color string such as '#808080'. Do not write a color tag unless the user explicitly asks to change a tag.
For requests to change a button or control background, call $setControlBackground with the exact control name or id and a CSS color string.
Do not use Node.js modules, require, imports, files, network access, eval, Function or subprocesses.
Do not implement emergency stops or safety interlocks in this script.
Preserve useful existing code when the user asks to improve it.`;
    }
    return `You write restricted Python scripts for FUXA industrial control.
Return Python source only, without markdown fences.
Every script must define def main(event):.
Available API: tags.read(tag_id), tags.write(tag_id, value), logger.info(message), logger.warning(message), logger.error(message).
event contains type, scriptId, scriptName and parameters.
Imports, files, network, subprocesses, eval and exec are forbidden.
Do not implement emergency stops or safety interlocks in this script.`;
}

async function generateAiScript(req, res, language) {
    const permission = checkGroupsFnc(req);
    if (runtime.settings.secureEnabled &&
        (!req.isAuthenticated || !authJwt.haveAdminPermission(permission))) {
        return res.status(401).json({error: "unauthorized_error", message: "Administrator permission is required"});
    }
    const aiSettings = runtime.settings.ai || {};
    const apiKey = aiSettings.apiKey || process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: "ai_not_configured",
            message: "Configure XAI_API_KEY or OPENAI_API_KEY in the workspace .env file"
        });
    }
    try {
        const baseUrl = (aiSettings.baseUrl || process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
        const projectContext = await collectProjectScriptContext(permission);
        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: aiSettings.model || process.env.MODEL,
            messages: [
                {
                    role: "system",
                    content: getAiSystemPrompt(language, req.body?.mode)
                },
                {
                    role: "user",
                    content: `FUXA tags: ${JSON.stringify(collectProjectTags())}
FUXA views, controls and scripts: ${JSON.stringify(projectContext)}
Script parameters: ${JSON.stringify(req.body?.parameters || [])}
Current source:
${req.body?.source || ""}
Requirement:
${req.body?.prompt || "Improve this script"}`
                }
            ],
            temperature: 0.1
        }, {
            timeout: 120000,
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });
        const content = response.data?.choices?.[0]?.message?.content || "";
        const source = sanitizeAiSource(content, language);
        if (language === 'javascript') {
            const allowedFunctions = getJavaScriptFunctionNames(req.body?.mode);
            const unsupportedFunctions = findUnsupportedSystemFunctions(source, allowedFunctions);
            if (unsupportedFunctions.length) {
                runtime.logger.error(`api AI javascript script: unsupported functions ${unsupportedFunctions.join(', ')}`);
                return res.status(422).json({
                    error: 'ai_unsupported_system_function',
                    message: `AI generated unsupported system functions: ${unsupportedFunctions.join(', ')}`,
                    unsupportedFunctions,
                    allowedFunctions
                });
            }
        }
        res.json({source});
    } catch (error) {
        const providerStatus = error.response?.status;
        const message = providerStatus === 403
            ? "AI provider rejected the configured key or model (HTTP 403)"
            : error.response?.data?.error?.message || error.message || "AI request failed";
        runtime.logger.error(`api AI ${language} script: ${message}`);
        res.status(502).json({error: "ai_request_failed", message, providerStatus});
    }
}

module.exports = {
    init: function (_runtime, _secureFnc, _checkGroupsFnc) {
        runtime = _runtime;
        secureFnc = _secureFnc;
        checkGroupsFnc = _checkGroupsFnc;
    },
    app: function () {
        var scriptsApp = express();
        scriptsApp.use(function (req, res, next) {
            if (!runtime.project) {
                res.status(404).end();
            } else {
                next();
            }
        });

        /**
         * POST runscript
         * Run script, can be call with script id or script content as test
         */
         scriptsApp.post("/api/runscript", secureFnc, function (req, res, next) {
            const permission = checkGroupsFnc(req);
            const script = req.body?.params?.script;
            if (res.statusCode === 403) {
                runtime.logger.error("api post runscript: Tocken Expired");
                //runtime.settings.secureEnabled
            } else if (script?.test && (!req.isAuthenticated || !authJwt.haveAdminPermission(permission))) {
                res.status(401).json({ error: "unauthorized_error", message: "Unauthorized!" });
                runtime.logger.error("api post runscript: Unauthorized test mode");
            } else if (!script?.test && !script?.id) {
                res.status(400).json({ error: "invalid_request", message: "Script id is required!" });
                runtime.logger.error("api post runscript: Missing script id");
            } else if (!runtime.scriptsMgr.isAuthorised(script, permission)) {
                res.status(400).json({ error: "unauthorized_error", message: "Unauthorized!" });
                runtime.logger.error("api post runscript: Unauthorized");
            } else {
                //req.body.params.script.parameters.permission = groups;
                runtime.scriptsMgr.runScript(script, req.body.params.toLogEvent).then(function (result) {
                    res.json(result);
                }).catch(function (err) {
                    if (err.code) {
                        res.status(400).json({ error: err.code, message: err.message });
                        runtime.logger.error("api post runscript: " + err.message);
                    } else {
                        res.status(400).json({ error: "unexpected_error", message: err.toString() });
                        runtime.logger.error("api post runscript: " + err);
                    }
                });
            }
        });

        /**
         * POST run server script and return result value
         */
        scriptsApp.post("/api/runSysFunction", secureFnc, async function (req, res, next) {
            var groups = checkGroupsFnc(req);
            if (res.statusCode === 403) {
                runtime.logger.error("api post runSysFunction: Tocken Expired");
            } else if (authJwt.adminGroups.indexOf(groups) === -1 ) {
                res.status(400).json({error:"unauthorized_error", message: "Unauthorized!"});
                runtime.logger.error("api post runSysFunction: Unauthorized");
            } else {
                try {
                    if (runtime.scriptsMgr.sysFunctionExist(req.body.params.functionName)) {
                        //req.body.params.parameters.permission = groups;
                        const result = await runtime.scriptsMgr.runSysFunction(req.body.params.functionName, req.body.params.parameters);
                        res.json(result);
                    } else {
                        res.status(400).json({ error: "not_found", message: 'script not found!'});
                        runtime.logger.error("api post runSysFunction: " + 'script not found!');
                    }
                } catch (error) {
                    res.status(400).json({ error: "error", message: error});
                    runtime.logger.error("api post runSysFunction: " + error);
                }
            }
        });

        scriptsApp.post("/api/ai/python-script", secureFnc, (req, res) =>
            generateAiScript(req, res, "python"));
        scriptsApp.post("/api/ai/javascript-script", secureFnc, (req, res) =>
            generateAiScript(req, res, "javascript"));
        return scriptsApp;
    }
}
