# ForgeControl extensions for FUXA

This source tree uses [FUXA](https://github.com/frangoteam/FUXA) as the SCADA/HMI foundation.
The upstream revision initially adopted by ForgeControl is
`2ec5d15dce43d6ca6d1642d754432e1f0d0c46b9`.

## Why FUXA is the foundation

FUXA already provides the parts that should not be reimplemented:

- Angular and SVG based HMI editor
- separate editor and runtime experiences
- Siemens S7 and Modbus TCP/RTU drivers
- device and tag management
- alarms, history, users and permissions
- server and client JavaScript scripts
- desktop, browser and Docker deployment options

ForgeControl extensions are additive. Existing FUXA projects and JavaScript scripts must
continue to work.

## Extension boundaries

### Python scripts

Python is a second script language, not a replacement for the existing JavaScript engine.

- `server/runtime/python`: isolated Python worker lifecycle
- `server/api/python`: authenticated validation and test execution API
- `client/src/app/scripts`: language selector and global Python scripts
- editor view events: page-scoped Python scripts
- gauge/control events: control-scoped Python scripts

Python code runs in a separate process and accesses FUXA through a narrow API:

- read and write authorised tags
- raise and clear authorised alarms
- structured logging
- event parameters

Runtime must enforce time, memory, import, file, network and write permissions.

### AI script assistant

AI only proposes source changes in editor mode. It receives a minimized context containing:

- the selected script and event
- tag ids, names, types and write capability
- the approved industrial API

Generated code requires a visible diff, validation and simulation before save. Runtime never
generates control code.

### Excel tag import

Only `.xlsx` is accepted. Import operates on the existing FUXA device and tag model.

Required columns:

| Column | FUXA mapping |
| --- | --- |
| `path` | `Tag.name` |
| `type` | `Tag.type` |
| `driver` | existing `Device.id` or `Device.name` |
| `address` | S7 `Tag.address`, or parsed Modbus memory/address |
| `scanRate` | device polling validation |
| `writable` | tag access metadata |
| `unit` | tag engineering-unit metadata |

Imports are previewed and validated before changing the project. Rows report Excel row
numbers, and duplicate tag names in one device are rejected.

## Delivery order

1. Establish reproducible upstream build and tests. **Complete**
2. Add Excel-only tag import and template generation. **Complete**
3. Add Python worker, API and server-side global scripts. **First version implemented**
4. Add page and control event Python editors.
5. Add AI generation, diff review and simulation.
6. Add signed editor-to-runtime publishing and audit records.

## Upstream maintenance

- Keep `upstream` pointed at `https://github.com/frangoteam/FUXA.git`.
- Place ForgeControl work on `forgecontrol/*` branches.
- Avoid changing FUXA protocol drivers unless an extension API is insufficient.
- Record upstream revision changes and run both FUXA and ForgeControl tests after rebasing.
