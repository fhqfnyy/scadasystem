
/*
* My Script Module: script container, scripts defined in frontend (string code) are to load as function
*/

'use strict';
const path = require('path');
const utils = require("../utils");
const { sanitizeAiSource } = require("../../api/scripts/ai-output");

var Module = module.constructor;

// const eventsIncludes = 'var events = require("../events").create();';
const requireInclude = `const path = require('path');`;
const eventsIncludes = 'var events; var id; var console = { log: function (msg) { if (events) events.emit(\'script-console\', { msg: msg, type: \'log\', id: id });}};';
// const eventsIncludes = 'var events = require("../events").create();';// var console = { log: function (msg) { if (events) events.emit(\'script-console\', { msg: msg, type: \'log\' });}}';
const initEvents = { name: 'init', code: 'events = _events; id = _id', parameters: [{ name: '_events' }, { name: '_id' }] };
// const setSystemFunctions = { name: 'setSysFunctions', code: 'Object.keys(systemFunctions).forEach(k => {  });', parameters: [{ name: '_sysfncs' }] };
// const consoleLog = { name: 'console', code: 'log: function (msg) { if (events) events.emit(\'script-console\', { msg: msg, type: \'log\' });}', parameters: [] };
// tempScripts['console.error'] = 'function (msg) { events.emit(\'device-status:changed\', { msg: msg, type: \'error\' }); }';

function MyScriptsModule(_events, _logger) {
    var events = _events;
    var logger = _logger;
    var module = new Module();
    var scriptsMap = {};
    var systemFunctions = {};
    var scriptsModule;
    var testTrace = null;

    function trace(message, type = 'log') {
        if (testTrace) {
            events.emit('script-console', {
                msg: `[${new Date().toISOString()}] ${message}`,
                type,
                id: testTrace.id
            });
        }
    }

    function formatTraceValue(value) {
        try {
            const text = JSON.stringify(value);
            return text && text.length > 500 ? `${text.slice(0, 500)}...` : text;
        } catch {
            return String(value);
        }
    }

    this.init = function (sysfncs) {
        systemFunctions = sysfncs;
        Object.keys(systemFunctions).forEach(k => {
            global[k] = function (...args) {
                trace(`ACTION ${k} called args=${formatTraceValue(args)}`);
                try {
                    const result = systemFunctions[k](...args);
                    if (result && typeof result.then === 'function') {
                        return result.then(value => {
                            trace(`ACTION ${k} completed result=${formatTraceValue(value)}`);
                            return value;
                        }).catch(err => {
                            trace(`ACTION ${k} failed error=${err.message || err}`, 'error');
                            throw err;
                        });
                    }
                    trace(`ACTION ${k} completed result=${formatTraceValue(result)}`);
                    return result;
                } catch (err) {
                    trace(`ACTION ${k} failed error=${err.message || err}`, 'error');
                    throw err;
                }
            };
        });
    }

    this.loadScripts = function (_scripts) {
        let result = _scriptsToModule(_scripts);
        scriptsModule = result.module;
        scriptsMap = result.scriptsMap;
        return result;
    }

    this.runTestScript = async function (_script) {
        // clone scripts and add or replace script to test
        var tempScripts = JSON.parse(JSON.stringify(scriptsMap));
        tempScripts[_script.name] = _script;
        tempScripts[initEvents.name] = initEvents;

        testTrace = { id: _script.outputId || _script.id };
        trace(`TEST started script=${_script.name} language=${_script.language || 'javascript'} mode=${_script.mode || 'SERVER'}`);
        try {
            var result = _scriptsToModule(tempScripts, eventsIncludes);
            if (result.module) {
                var paramValues = _script.parameters.map(p => utils.isNullOrUndefined(p.value) ? p : p.value);
                result.module[initEvents.name](events, _script.outputId);
                const value = await result.module[_script.name](...paramValues);
                trace(`TEST completed result=${formatTraceValue(value)}`);
                return value;
            }
            throw new Error('Script module was not created');
        } catch (err) {
            trace(`TEST failed error=${err.message || err}`, 'error');
            throw err;
        } finally {
            testTrace = null;
        }
    }

    this.runScript = async function (_script) {
        if (!scriptsModule) {
            throw new Error('Scripts module is not loaded');
        }
        var paramValues = (_script.parameters || []).map(p => utils.isNullOrUndefined(p.value) ? p : p.value);
        if (_script.id) {
            _script = Object.values(scriptsMap).find(s => s.id === _script.id);
        }
        if (!_script || typeof scriptsModule[_script.name] !== 'function') {
            throw new Error(`Script not loaded: ${_script?.id || _script?.name || 'unknown'}`);
        }
        testTrace = { id: _script.id };
        trace(`RUN started script=${_script.name} mode=${_script.mode || 'SERVER'}`);
        try {
            const value = await scriptsModule[_script.name](...paramValues);
            trace(`RUN completed result=${formatTraceValue(value)}`);
            return value;
        } catch (err) {
            trace(`RUN failed error=${err.message || err}`, 'error');
            throw err;
        } finally {
            testTrace = null;
        }
    }

    this.runScriptWithoutParameter = async function (_script) {
        if (!scriptsModule) {
            throw new Error('Scripts module is not loaded');
        }
        if (!_script.name) {
            _script = Object.values(scriptsMap).find(s => s.id === _script.id);
        }
        if (!_script || typeof scriptsModule[_script.name] !== 'function') {
            throw new Error(`Script not loaded: ${_script?.id || 'unknown'}`);
        }
        testTrace = { id: _script.id };
        trace(`RUN scheduled script=${_script.name}`);
        try {
            const value = await scriptsModule[_script.name]();
            trace(`RUN completed result=${formatTraceValue(value)}`);
            return value;
        } catch (err) {
            trace(`RUN failed error=${err.message || err}`, 'error');
            throw err;
        } finally {
            testTrace = null;
        }
    }

    this.runSysFunction = function (functionName, params) {
        return global[functionName](...params || []);
    }

    this.getScript = function (_script) {
        return Object.values(scriptsMap).find(s => s.id === _script.id);
    }

    this.getScriptByName = function (scriptName) {
        return Object.values(scriptsMap).find(s => s.name === scriptName);
    }

    var _scriptsToModule = function (_scripts, _includes) {
        let result = { module: null, messages: [], scriptsMap: {} };
        try {
            let functions = '';
            let toexport = '';
            Object.values(_scripts).forEach((script) => {
                try {
                    if (script.language === 'python') {
                        result.scriptsMap[script.name] = script;
                        return;
                    }
                    if (script.code) {
                        const sanitizedCode = sanitizeAiSource(script.code, 'javascript');
                        if (sanitizedCode !== script.code.trim()) {
                            logger.warn(`load.script ${script.name}: removed non-code AI output`);
                            script.code = sanitizedCode;
                        }
                        var params = '';
                        for (let i = 0; i < script.parameters.length; i++) {
                            if (params.length) params += ',';
                            params += `${script.parameters[i].name}`;
                        }
                        const asyncText = script.sync ? '' : 'async';
                        functions += `${asyncText} function ${script.name} (${params}) { try { ${script.code} \n} catch (fuxaError) { console.log(fuxaError); return JSON.stringify(fuxaError); } }`;
                        toexport += `${script.name}: ${script.name}, `;
                        result.scriptsMap[script.name] = script;
                    } else {
                        logger.warn(`load.script ${script.name} without code!`);
                        result.messages.push(`load.script ${script.name} without code!`);
                    }
                } catch(e) {
                    logger.error(`load.script ${script.name} error: ${(e.stack) ? e.stack : e}`);
                    result.messages.push(`load.script ${script.name} error!`);
                }
            });
            var code = '';
            if (_includes) {
                code = `${_includes}`;
            }
            var code = `${requireInclude} ${code} ${functions} module.exports = { ${toexport} };`;
            var filename = path.resolve(__dirname, 'msm-scripts.js');
            result.module = _requireFromString(code, filename);
        } catch(ex) {
            logger.error(`load.script error: ${(ex.stack) ? ex.stack : ex}`);
            return ex;
        }
        return result;
    }

    var _requireFromString = function (src, filename) {
        delete require.cache[filename];
        var Module = module.constructor;
        var m = new Module();
        m._compile(src, filename);
        return m.exports;
    }
}

module.exports = {
    create: function (events, logger) {
        return new MyScriptsModule(events, logger);
    }
};
