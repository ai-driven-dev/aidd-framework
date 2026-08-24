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
| [plugin.json](.claude-plugin/plugin.json) |

### `hooks`

| File |
|------|
| [hooks.json](hooks/hooks.json) |
| [journal.js](hooks/journal.js) |
| [opencode-plugin.js](hooks/opencode-plugin.js) |
| [package.json](hooks/package.json) |

#### `hooks/lib`

| File |
|------|
| [file-writes.js](hooks/lib/file-writes.js) |
| [host.js](hooks/lib/host.js) |
| [record.js](hooks/lib/record.js) |
| [repo.js](hooks/lib/repo.js) |
| [step-starts.js](hooks/lib/step-starts.js) |
| [task-declared.js](hooks/lib/task-declared.js) |

### `skills`

#### `skills/00-init`

| File | Description |
|------|---|
| [package.json](skills/00-init/package.json) | - |
| [SKILL.md](skills/00-init/SKILL.md) | `Turns AIDD measurement on for a project, proves it is recording, and lets a person opt into (or out of) naming themselves on their own records. Use when the user wants to start measuring what their work costs, wants to stop, asks why nothing is being recorded, or wants their own name to appear on (or disappear from) what gets measured. Not for answering what a piece of work consumed.` |

#### `skills/01-cost`

| File | Description |
|------|---|
| [package.json](skills/01-cost/package.json) | - |
| [SKILL.md](skills/01-cost/SKILL.md) | `Answers what a period or one task consumed - a total, a day-by-day series, or a breakdown by step, model, tool or project - and hands back the artefact each question deserves. Use when the user asks what a piece of work cost, what changed, where the effort went, or for which project. Not for turning measurement on, and not for a per-person figure.` |

#### `skills/02-check`

| File | Description |
|------|---|
| [package.json](skills/02-check/package.json) | - |
| [SKILL.md](skills/02-check/SKILL.md) | `Answers whether AIDD measurement is actually recording, one independently verifiable line per claim. Use when the user doubts a figure, sees no run file appear, or wants proof the chain is working. Not for turning measurement on or answering what a period cost.` |

