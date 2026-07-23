'use strict';

const { expect } = require('chai');
const { sanitizeAiSource, findUnsupportedSystemFunctions } = require('../../api/scripts/ai-output');

describe('AI script output sanitizer', () => {
    it('removes leaked thinking and keeps the JavaScript body', () => {
        const output = `<think>The user wants to change the background.
I will use the RGB integer 8421504.
</think>

await $setTag('t_584e981a-98e346b4', 8421504);`;

        expect(sanitizeAiSource(output, 'javascript'))
            .to.equal("await $setTag('t_584e981a-98e346b4', 8421504);");
    });

    it('removes prose appended after a JavaScript statement', () => {
        const output = `<think>reasoning</think>
await $setTag('color', 8421504);，这是生成的代码`;

        expect(sanitizeAiSource(output, 'javascript'))
            .to.equal("await $setTag('color', 8421504);");
    });

    it('extracts code from markdown fences and removes surrounding prose', () => {
        const output = `下面是生成的代码：
\`\`\`javascript
const value = await $getTag('temperature');
if (value > 80) {
    $setTag('alarm', true);
}
\`\`\`
请在保存前测试。`;

        expect(sanitizeAiSource(output, 'javascript')).to.equal(
`const value = await $getTag('temperature');
if (value > 80) {
    $setTag('alarm', true);
}`);
    });

    it('preserves a valid restricted Python script', () => {
        const output = `<analysis>Need to log the value.</analysis>
\`\`\`python
def main(event):
    value = tags.read("temperature")
    logger.info(value)
\`\`\``;

        expect(sanitizeAiSource(output, 'python')).to.equal(
`def main(event):
    value = tags.read("temperature")
    logger.info(value)`);
    });

    it('detects invented system functions and keeps valid functions', () => {
        const source = `$setViewBackground('#00ff00');
$setControlBackground('button_1', '#00ff00');
$setControlText('button_1', 'Running');`;

        expect(findUnsupportedSystemFunctions(source, [
            '$setViewBackground',
            '$setControlBackground'
        ])).to.deep.equal(['$setControlText']);
    });

    it('returns each unsupported system function only once', () => {
        const source = `$missing();
$missing(1);`;
        expect(findUnsupportedSystemFunctions(source, [])).to.deep.equal(['$missing']);
    });
});
