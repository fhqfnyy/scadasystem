'use strict';

function stripThinking(text) {
    let result = text;
    result = result.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    result = result.replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, '');
    return result;
}

function extractFencedCode(text) {
    const blocks = [...text.matchAll(/```(?:javascript|js|python|py)?\s*\r?\n?([\s\S]*?)```/gi)];
    if (!blocks.length) {
        return text;
    }
    return blocks.map(match => match[1].trim()).filter(Boolean).join('\n\n');
}

function stripJavaScriptProse(text) {
    const lines = text.split(/\r?\n/);
    const codeStart = lines.findIndex(line =>
        /^\s*(?:await\s+)?\$[a-zA-Z_$][\w$]*\s*\(/.test(line) ||
        /^\s*(?:const|let|var|if|for|while|switch|try|return|throw|async|function|class)\b/.test(line) ||
        /^\s*[a-zA-Z_$][\w$]*\s*[.(=[{]/.test(line) ||
        /^\s*[{}[\]();]/.test(line)
    );
    return codeStart > 0 ? lines.slice(codeStart).join('\n') : text;
}

function stripPythonProse(text) {
    const lines = text.split(/\r?\n/);
    const codeStart = lines.findIndex(line =>
        /^\s*(?:def|async\s+def|if|for|while|try|with|return|raise|class)\b/.test(line) ||
        /^\s*(?:tags|logger)\./.test(line) ||
        /^\s*[a-zA-Z_]\w*\s*=/.test(line)
    );
    return codeStart > 0 ? lines.slice(codeStart).join('\n') : text;
}

function sanitizeAiSource(content, language) {
    let source = String(content || '').replace(/^\uFEFF/, '').trim();
    source = stripThinking(source).trim();
    source = extractFencedCode(source).trim();
    source = source.replace(/^```[^\r\n]*\r?\n?/i, '').replace(/```\s*$/i, '').trim();
    source = language === 'python' ? stripPythonProse(source) : stripJavaScriptProse(source);
    if (language !== 'python') {
        source = source.replace(/;[，。]\s*[^\r\n{}]*$/u, ';');
    }
    return source.trim();
}

function findUnsupportedSystemFunctions(source, allowedFunctions) {
    const allowed = new Set(allowedFunctions || []);
    const calls = [...String(source || '').matchAll(/\$[a-zA-Z_$][\w$]*\s*(?=\()/g)]
        .map(match => match[0].trim());
    return [...new Set(calls.filter(name => !allowed.has(name)))];
}

module.exports = {
    sanitizeAiSource,
    findUnsupportedSystemFunctions
};
