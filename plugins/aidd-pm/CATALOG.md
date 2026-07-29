# aidd-pm catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-pm` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/01-ticket-info`](#skills01-ticket-info)
  - [`skills/02-user-stories`](#skills02-user-stories)
  - [`skills/03-discovery`](#skills03-discovery)
  - [`skills/04-prd`](#skills04-prd)
  - [`skills/05-spec`](#skills05-spec)
  - [`skills/06-spike`](#skills06-spike)

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

#### `skills/03-discovery`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-frame.md](skills/03-discovery/actions/01-frame.md) | - |
| `actions` | [02-discover.md](skills/03-discovery/actions/02-discover.md) | - |
| `actions` | [03-visualize.md](skills/03-discovery/actions/03-visualize.md) | - |
| `actions` | [04-shape.md](skills/03-discovery/actions/04-shape.md) | - |
| `actions` | [05-finalize.md](skills/03-discovery/actions/05-finalize.md) | - |
| `assets` | [product-brief.md](skills/03-discovery/assets/product-brief.md) | - |
| `references` | [brief-quality.md](skills/03-discovery/references/brief-quality.md) | - |
| `references` | [evidence.md](skills/03-discovery/references/evidence.md) | - |
| `references` | [persistence.md](skills/03-discovery/references/persistence.md) | - |
| `references` | [techniques.md](skills/03-discovery/references/techniques.md) | - |
| `references` | [visuals.md](skills/03-discovery/references/visuals.md) | - |
| `-` | [SKILL.md](skills/03-discovery/SKILL.md) | `Produces a concise Product Brief before requirements. Use when the user wants to frame or revisit a product opportunity and how it will be validated. Not for requirements, technical design, or planning.` |

#### `skills/04-prd`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-prd.md](skills/04-prd/actions/01-prd.md) | - |
| `assets` | [prd-template.md](skills/04-prd/assets/prd-template.md) | - |
| `assets` | [task-template.md](skills/04-prd/assets/task-template.md) | `Task tracking system to ensure all tasks are categorized and addressed` |
| `references` | [product-brief-input.md](skills/04-prd/references/product-brief-input.md) | - |
| `-` | [SKILL.md](skills/04-prd/SKILL.md) | `Generates a structured Product Requirements Document from a request, user stories, or a Product Brief. Use when the user wants to draft product requirements. Not for product discovery, technical design, or implementation planning.` |

#### `skills/05-spec`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-build.md](skills/05-spec/actions/01-build.md) | - |
| `actions` | [02-refine.md](skills/05-spec/actions/02-refine.md) | - |
| `assets` | [spec-template.md](skills/05-spec/assets/spec-template.md) | - |
| `-` | [SKILL.md](skills/05-spec/SKILL.md) | `Generate or refine a spec, a feature's immutable contract, from a request, a PRD, or review findings. Use to draft or refine a spec. Do NOT use to write code, a full PRD, or change a locked spec.` |

#### `skills/06-spike`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-create.md](skills/06-spike/actions/01-create.md) | - |
| `actions` | [02-investigate.md](skills/06-spike/actions/02-investigate.md) | - |
| `actions` | [03-conclude.md](skills/06-spike/actions/03-conclude.md) | - |
| `assets` | [spike-template.md](skills/06-spike/assets/spike-template.md) | - |
| `references` | [capabilities.md](skills/06-spike/references/capabilities.md) | - |
| `references` | [investigation.md](skills/06-spike/references/investigation.md) | - |
| `references` | [lifecycle.md](skills/06-spike/references/lifecycle.md) | - |
| `references` | [persistence.md](skills/06-spike/references/persistence.md) | - |
| `references` | [qualification.md](skills/06-spike/references/qualification.md) | - |
| `-` | [SKILL.md](skills/06-spike/SKILL.md) | `Produces an evidence-bounded spike for an uncertainty blocking estimation, feasibility, or design. Use when the user wants to frame, investigate, resume, or conclude one. Not for general research or implementation.` |

