'use strict';

const path = require('path');
const { spawn } = require('child_process');

class PythonRunner {
    constructor(runtime) {
        this.runtime = runtime;
        this.python = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
        this.workerPath = path.join(__dirname, 'worker.py');
    }

    async run(script) {
        const devices = this.runtime.project.getDevices() || {};
        const tags = {};
        Object.values(devices).forEach(device => {
            Object.values(device.tags || {}).forEach(tag => {
                tags[tag.id] = this.runtime.devices.getTagValue(tag.id);
            });
        });
        const event = Object.fromEntries((script.parameters || []).map(param => [param.name, param.value]));
        const result = await this.execute({
            code: script.code || '',
            tags,
            event: {
                type: script.test ? 'test' : 'run',
                scriptId: script.id,
                scriptName: script.name,
                parameters: event
            }
        });
        if (!result.ok) {
            const error = new Error(result.error || 'Python execution failed');
            error.code = 'python_script_error';
            error.trace = result.trace;
            throw error;
        }
        for (const write of result.writes || []) {
            await this.runtime.devices.setTagValue(write.tagId, write.value);
        }
        (result.logs || []).forEach(entry => {
            this.runtime.events.emit('script-console', {
                id: script.outputId || script.id,
                type: entry.level,
                msg: `[PYTHON ${entry.level.toUpperCase()}] ${entry.message}`
            });
        });
        return result.value ?? {
            ok: true,
            writes: result.writes || [],
            logs: result.logs || []
        };
    }

    execute(payload, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const child = spawn(this.python, [this.workerPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error(`Python script exceeded ${timeoutMs}ms`));
            }, timeoutMs);
            child.stdout.on('data', chunk => stdout += chunk);
            child.stderr.on('data', chunk => stderr += chunk);
            child.on('error', error => {
                clearTimeout(timer);
                reject(error);
            });
            child.on('close', code => {
                clearTimeout(timer);
                if (code !== 0) {
                    return reject(new Error(stderr || `Python worker exited with code ${code}`));
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (error) {
                    reject(new Error(`Invalid Python worker response: ${stdout || stderr}`));
                }
            });
            child.stdin.end(JSON.stringify(payload));
        });
    }
}

module.exports = {
    create: runtime => new PythonRunner(runtime)
};
