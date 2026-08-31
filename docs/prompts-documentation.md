# AIDD Framework Catalog

Auto-generated framework content: agents, commands, rules, skills, and templates.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`hooks`](#hooks)
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
| [opencode-plugin.js](../plugins/aidd-telemetry/hooks/opencode-plugin.js) |

### `skills`

#### `skills/00-init`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/00-init/SKILL.md) | `Turns AIDD measurement on for a project, proves it is recording, lets a person opt into (or out of) naming themselves on their own records, and removes what was measured when asked. Use when the user wants to start measuring what their work costs, wants to stop, asks why nothing is being recorded, wants their own name to appear on (or disappear from) what gets measured, or wants their measured data deleted. Not for answering what a piece of work consumed.` |

#### `skills/01-cost`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/01-cost/SKILL.md) | `Answers what a period or one task consumed - a total, a day-by-day series, or a breakdown by step, model, tool, project or person - and hands back the artefact each question deserves. Use when the user asks what a piece of work cost, what changed, where the effort went, for which project, or who spent it. Not for turning measurement on.` |

#### `skills/02-check`

| File | Description |
|------|---|
| [SKILL.md](../plugins/aidd-telemetry/skills/02-check/SKILL.md) | `States what is in place — where measurement is allowed from, whether an identity is attached, where records land, whether the recorder is declared — then answers whether AIDD measurement is actually recording, one independently verifiable line per claim. Use when the user doubts a figure, sees no run file appear, wants proof the chain is working, or wants to know what is already configured. Not for turning measurement on or answering what a period cost.` |

