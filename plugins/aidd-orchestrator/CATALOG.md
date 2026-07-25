# aidd-orchestrator catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-orchestrator` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/00-async-dev`](#skills00-async-dev)
  - [`skills/01-sdlc`](#skills01-sdlc)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `skills`

#### `skills/00-async-dev`

| Group | File | Description |
|-------|------|---|
| `references` | [routing.md](skills/00-async-dev/references/routing.md) | - |
| `-` | [SKILL.md](skills/00-async-dev/SKILL.md) | `Drive the async-dev pipeline from one entry point, whether setup, run, or review. Use when the user wants to install async dev, run a ready issue, or address PR review comments, or on a webhook trigger. Not for plain status checks.` |

#### `skills/01-sdlc`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-spec.md](skills/01-sdlc/actions/01-spec.md) | - |
| `actions` | [02-plan.md](skills/01-sdlc/actions/02-plan.md) | - |
| `actions` | [03-implement.md](skills/01-sdlc/actions/03-implement.md) | - |
| `actions` | [04-review.md](skills/01-sdlc/actions/04-review.md) | - |
| `actions` | [05-ship.md](skills/01-sdlc/actions/05-ship.md) | - |
| `-` | [SKILL.md](skills/01-sdlc/SKILL.md) | `Orchestrates a request from specification to shipped code, isolating implementation and review in specialized agents. Use when the user wants to deliver a change end to end. Not for running a single development step.` |

