# aidd-pm catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-pm` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/01-ticket-info`](#skills01-ticket-info)
  - [`skills/02-user-stories`](#skills02-user-stories)
  - [`skills/03-prd`](#skills03-prd)
  - [`skills/04-spec`](#skills04-spec)
  - [`skills/05-spike`](#skills05-spike)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `skills`

#### `skills/01-ticket-info`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-ticket-info.md](skills/01-ticket-info/actions/01-ticket-info.md) | - |
| `-` | [SKILL.md](skills/01-ticket-info/SKILL.md) | `Retrieve and display a ticket from the configured ticketing tool. Use when the user wants to see, show, or look up a ticket's details. Not for creating a ticket, or commenting on, transitioning, or reassigning one.` |

#### `skills/02-user-stories`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-clarify-scope.md](skills/02-user-stories/actions/01-clarify-scope.md) | - |
| `actions` | [02-split-epic.md](skills/02-user-stories/actions/02-split-epic.md) | - |
| `actions` | [03-draft-stories.md](skills/02-user-stories/actions/03-draft-stories.md) | - |
| `actions` | [04-estimate-impact.md](skills/02-user-stories/actions/04-estimate-impact.md) | - |
| `actions` | [05-prioritize.md](skills/02-user-stories/actions/05-prioritize.md) | - |
| `actions` | [06-sync-tracker.md](skills/02-user-stories/actions/06-sync-tracker.md) | - |
| `assets` | [user-story-template.md](skills/02-user-stories/assets/user-story-template.md) | - |
| `references` | [rating.md](skills/02-user-stories/references/rating.md) | - |
| `-` | [SKILL.md](skills/02-user-stories/SKILL.md) | `Turn a feature or epic into a prioritized, estimated, INVEST-compliant user-story backlog in the tracker. Use when the user wants to create, split, estimate, or prioritize user stories. Not for source code or a PRD.` |

#### `skills/03-prd`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-prd.md](skills/03-prd/actions/01-prd.md) | - |
| `assets` | [prd-template.md](skills/03-prd/assets/prd-template.md) | - |
| `assets` | [task-template.md](skills/03-prd/assets/task-template.md) | `Task tracking system to ensure all tasks are categorized and addressed` |
| `-` | [SKILL.md](skills/03-prd/SKILL.md) | `Generate a structured Product Requirements Document from a need, idea, or brainstorm, confirmed before save. Use when the user wants to draft or generate a PRD or product requirements. Not for user stories or a technical plan.` |

#### `skills/04-spec`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-build.md](skills/04-spec/actions/01-build.md) | - |
| `actions` | [02-refine.md](skills/04-spec/actions/02-refine.md) | - |
| `assets` | [spec-template.md](skills/04-spec/assets/spec-template.md) | - |
| `-` | [SKILL.md](skills/04-spec/SKILL.md) | `Generate or refine a spec, a feature's immutable contract, from a request, a PRD, or review findings. Use to draft or refine a spec. Do NOT use to write code, a full PRD, or change a locked spec.` |

#### `skills/05-spike`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-create.md](skills/05-spike/actions/01-create.md) | - |
| `actions` | [02-investigate.md](skills/05-spike/actions/02-investigate.md) | - |
| `actions` | [03-conclude.md](skills/05-spike/actions/03-conclude.md) | - |
| `assets` | [spike-template.md](skills/05-spike/assets/spike-template.md) | - |
| `references` | [capabilities.md](skills/05-spike/references/capabilities.md) | - |
| `references` | [investigation.md](skills/05-spike/references/investigation.md) | - |
| `references` | [lifecycle.md](skills/05-spike/references/lifecycle.md) | - |
| `references` | [persistence.md](skills/05-spike/references/persistence.md) | - |
| `references` | [qualification.md](skills/05-spike/references/qualification.md) | - |
| `-` | [SKILL.md](skills/05-spike/SKILL.md) | `Produces an evidence-bounded spike for an uncertainty blocking estimation, feasibility, or design. Use when the user wants to frame, investigate, resume, or conclude one. Not for general research or implementation.` |

