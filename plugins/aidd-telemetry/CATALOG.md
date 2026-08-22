# aidd-telemetry catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-telemetry` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`hooks`](#hooks)
  - [`hooks/lib`](#hookslib)
- [`skills`](#skills)
  - [`skills/00-init`](#skills00-init)
  - [`skills/01-cost`](#skills01-cost)
  - [`skills/02-check`](#skills02-check)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `hooks`

| File |
|------|
| [hooks.json](hooks/hooks.json) |
| [journal.js](hooks/journal.js) |
| [opencode-plugin.js](hooks/opencode-plugin.js) |

#### `hooks/lib`

| File |
|------|
| [file-writes.js](hooks/lib/file-writes.js) |
| [host.js](hooks/lib/host.js) |
| [record.js](hooks/lib/record.js) |
| [repo.js](hooks/lib/repo.js) |
| [step-starts.js](hooks/lib/step-starts.js) |

### `skills`

#### `skills/00-init`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-check.md](skills/00-init/actions/01-check.md) | - |
| `actions` | [02-enable.md](skills/00-init/actions/02-enable.md) | - |
| `actions` | [03-verify.md](skills/00-init/actions/03-verify.md) | - |
| `scripts` | [telemetry-switch.js](skills/00-init/scripts/telemetry-switch.js) | - |
| `-` | [SKILL.md](skills/00-init/SKILL.md) | `Turns AIDD measurement on for a project and proves it is recording. Use when the user wants to start measuring what their work costs, wants to stop, or asks why nothing is being recorded. Not for answering what a piece of work consumed.` |

#### `skills/01-cost`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-locate.md](skills/01-cost/actions/01-locate.md) | - |
| `actions` | [02-collect.md](skills/01-cost/actions/02-collect.md) | - |
| `actions` | [03-report.md](skills/01-cost/actions/03-report.md) | - |
| `scripts` | [telemetry-report.js](skills/01-cost/scripts/telemetry-report.js) | - |
| `-` | [SKILL.md](skills/01-cost/SKILL.md) | `Answers what a period or one task consumed, broken down by step, model and tool, with how strongly each figure was attributed. Use when the user asks what a piece of work cost, where the effort went, or which step or model consumed the most. Not for turning measurement on.` |

#### `skills/02-check`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-locate.md](skills/02-check/actions/01-locate.md) | - |
| `actions` | [02-diagnose.md](skills/02-check/actions/02-diagnose.md) | - |
| `scripts` | [telemetry-check.js](skills/02-check/scripts/telemetry-check.js) | - |
| `-` | [SKILL.md](skills/02-check/SKILL.md) | `Answers whether AIDD measurement is actually recording, one independently verifiable line per claim. Use when the user doubts a figure, sees no run file appear, or wants proof the chain is working. Not for turning measurement on or answering what a period cost.` |

