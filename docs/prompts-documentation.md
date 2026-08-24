# AIDD Framework Catalog

Auto-generated framework content: agents, commands, rules, skills, and templates.

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
| [plugin.json](../plugins/aidd-telemetry/.claude-plugin/plugin.json) |

### `hooks`

| File |
|------|
| [hooks.json](../plugins/aidd-telemetry/hooks/hooks.json) |
| [journal.cjs](../plugins/aidd-telemetry/hooks/journal.cjs) |
| [opencode-plugin.js](../plugins/aidd-telemetry/hooks/opencode-plugin.js) |

#### `hooks/lib`

| File |
|------|
| [file-writes.cjs](../plugins/aidd-telemetry/hooks/lib/file-writes.cjs) |
| [host.cjs](../plugins/aidd-telemetry/hooks/lib/host.cjs) |
| [record.cjs](../plugins/aidd-telemetry/hooks/lib/record.cjs) |
| [repo.cjs](../plugins/aidd-telemetry/hooks/lib/repo.cjs) |
| [step-starts.cjs](../plugins/aidd-telemetry/hooks/lib/step-starts.cjs) |
| [task-declared.cjs](../plugins/aidd-telemetry/hooks/lib/task-declared.cjs) |

### `skills`

#### `skills/00-init`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/00-init/SKILL.md) | `Turns AIDD measurement on for a project, proves it is recording, and lets a person opt into (or out of) naming themselves on their own records. Use when the user wants to start measuring what their work costs, wants to stop, asks why nothing is being recorded, or wants their own name to appear on (or disappear from) what gets measured. Not for answering what a piece of work consumed.` |

#### `skills/01-cost`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/01-cost/SKILL.md) | `Answers what a period or one task consumed - a total, a day-by-day series, or a breakdown by step, model, tool or project - and hands back the artefact each question deserves. Use when the user asks what a piece of work cost, what changed, where the effort went, or for which project. Not for turning measurement on, and not for a per-person figure.` |

#### `skills/02-check`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/02-check/SKILL.md) | `Answers whether AIDD measurement is actually recording, one independently verifiable line per claim. Use when the user doubts a figure, sees no run file appear, or wants proof the chain is working. Not for turning measurement on or answering what a period cost.` |

