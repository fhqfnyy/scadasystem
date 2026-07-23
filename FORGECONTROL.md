# ForgeControl

ForgeControl extends FUXA with AI-assisted Python engineering, Excel tag import and a
controlled editor-to-runtime workflow.

The editor defaults to Simplified Chinese (`zh-cn`). English remains available and can
be selected from application settings.

Python scripts coexist with FUXA JavaScript scripts. Python execution is isolated in a
worker process and AI-generated code is always treated as an editor-side candidate that
must be tested before saving.

See [docs/forgecontrol-extensions.md](docs/forgecontrol-extensions.md) for architecture,
compatibility rules and delivery order.
