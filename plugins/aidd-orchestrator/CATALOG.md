# aidd-orchestrator catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-orchestrator` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/00-async-dev`](#skills00-async-dev)
  - [`skills/01-sdlc`](#skills01-sdlc)
  - [`skills/02-backlog`](#skills02-backlog)

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
| `references` | [01-frame.md](skills/01-sdlc/references/01-frame.md) | - |
| `references` | [02-deliver.md](skills/01-sdlc/references/02-deliver.md) | - |
| `references` | [03-check.md](skills/01-sdlc/references/03-check.md) | - |
| `-` | [SKILL.md](skills/01-sdlc/SKILL.md) | `Autonomously orchestrates a request from framing to a draft pull request, isolating implementation, independent review, and final outcome challenge. Use when the user wants to deliver a change end to end. Not for running one development step.` |

#### `skills/02-backlog`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-inspect.md](skills/02-backlog/actions/01-inspect.md) | - |
| `actions` | [02-triage.md](skills/02-backlog/actions/02-triage.md) | - |
| `actions` | [03-review.md](skills/02-backlog/actions/03-review.md) | - |
| `actions` | [04-route.md](skills/02-backlog/actions/04-route.md) | - |
| `actions` | [05-assess.md](skills/02-backlog/actions/05-assess.md) | - |
| `actions` | [06-decide.md](skills/02-backlog/actions/06-decide.md) | - |
| `actions` | [07-apply.md](skills/02-backlog/actions/07-apply.md) | - |
| `actions` | [08-verify.md](skills/02-backlog/actions/08-verify.md) | - |
| `references` | [change-set.md](skills/02-backlog/references/change-set.md) | - |
| `references` | [events.md](skills/02-backlog/references/events.md) | - |
| `references` | [intake.md](skills/02-backlog/references/intake.md) | - |
| `references` | [modes.md](skills/02-backlog/references/modes.md) | - |
| `references` | [review.md](skills/02-backlog/references/review.md) | - |
| `references` | [supports.md](skills/02-backlog/references/supports.md) | - |
| `-` | [SKILL.md](skills/02-backlog/SKILL.md) | `Orchestrates a product backlog end to end. Use when the user wants to ask what it holds, or to run intake, triage, refinement, review, lifecycle events, ordering, health checks, or repair. Not for one known artifact step.` |

