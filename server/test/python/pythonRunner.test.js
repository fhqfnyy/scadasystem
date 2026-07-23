const { expect } = require('chai');
const PythonRunner = require('../../runtime/python');

describe('ForgeControl Python runner', function () {
    this.timeout(10000);

    function createRuntime() {
        const writes = [];
        const messages = [];
        return {
            writes,
            messages,
            project: {
                getDevices: () => ({
                    plc: {
                        tags: {
                            temperature: {id: 'temperature'},
                            valve: {id: 'valve'}
                        }
                    }
                })
            },
            devices: {
                getTagValue: id => id === 'temperature' ? 90 : 0,
                setTagValue: async (id, value) => writes.push({id, value})
            },
            events: {
                emit: (_event, message) => messages.push(message)
            }
        };
    }

    it('executes a Python script and applies tag writes', async function () {
        const runtime = createRuntime();
        const runner = PythonRunner.create(runtime);
        const result = await runner.run({
            id: 'python-test',
            name: 'high_temperature',
            language: 'python',
            test: true,
            parameters: [],
            code: `def main(event):
    temperature = tags.read("temperature")
    logger.info(f"temperature={temperature}")
    if temperature > 85:
        tags.write("valve", 80)
`
        });
        expect(result.writes).to.deep.equal([{tagId: 'valve', value: 80}]);
        expect(runtime.writes).to.deep.equal([{id: 'valve', value: 80}]);
        expect(runtime.messages[0].msg).to.contain('temperature=90');
    });

    it('rejects imports', async function () {
        const runner = PythonRunner.create(createRuntime());
        let error;
        try {
            await runner.run({
                id: 'bad-python',
                name: 'bad_python',
                language: 'python',
                parameters: [],
                code: `import os
def main(event):
    return os.getcwd()
`
            });
        } catch (err) {
            error = err;
        }
        expect(error).to.exist;
        expect(error.message).to.contain('Forbidden Python syntax');
    });
});
