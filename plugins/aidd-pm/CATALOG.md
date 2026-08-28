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
  - [`skills/06-product-brief`](#skills06-product-brief)
  - [`skills/07-epic`](#skills07-epic)
  - [`skills/08-three-amigos`](#skills08-three-amigos)
  - [`skills/09-defect`](#skills09-defect)
  - [`skills/10-task`](#skills10-task)

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
| `assets` | [ticket-template.md](skills/01-ticket-info/assets/ticket-template.md) | - |
| `references` | [tool-detection.md](skills/01-ticket-info/references/tool-detection.md) | - |
| `-` | [SKILL.md](skills/01-ticket-info/SKILL.md) | `Retrieve and display a ticket from the configured ticketing tool. Use when the user wants to see, show, or look up a ticket's details. Not for creating a ticket, or commenting on, transitioning, or reassigning one.` |

#### `skills/02-user-stories`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-frame.md](skills/02-user-stories/actions/01-frame.md) | - |
| `actions` | [02-slice.md](skills/02-user-stories/actions/02-slice.md) | - |
| `actions` | [03-write.md](skills/02-user-stories/actions/03-write.md) | - |
| `actions` | [04-assess.md](skills/02-user-stories/actions/04-assess.md) | - |
| `actions` | [05-estimation.md](skills/02-user-stories/actions/05-estimation.md) | - |
| `actions` | [06-order.md](skills/02-user-stories/actions/06-order.md) | - |
| `actions` | [07-finalize.md](skills/02-user-stories/actions/07-finalize.md) | - |
| `assets` | [user-story-template.md](skills/02-user-stories/assets/user-story-template.md) | - |
| `references` | [estimation.md](skills/02-user-stories/references/estimation.md) | - |
| `references` | [handoffs.md](skills/02-user-stories/references/handoffs.md) | - |
| `references` | [lifecycle.md](skills/02-user-stories/references/lifecycle.md) | - |
| `references` | [ordering.md](skills/02-user-stories/references/ordering.md) | - |
| `references` | [persistence.md](skills/02-user-stories/references/persistence.md) | - |
| `references` | [qualification.md](skills/02-user-stories/references/qualification.md) | - |
| `references` | [readiness.md](skills/02-user-stories/references/readiness.md) | - |
| `references` | [relations.md](skills/02-user-stories/references/relations.md) | - |
| `references` | [slicing.md](skills/02-user-stories/references/slicing.md) | - |
| `-` | [SKILL.md](skills/02-user-stories/SKILL.md) | `Produces or refines ordered User Stories from an Epic, Product Brief, PRD, or bounded request. Use when the user wants to slice, write, assess, order, or persist Stories. Not for Epics or implementation.` |

#### `skills/03-prd`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-draft.md](skills/03-prd/actions/01-draft.md) | - |
| `actions` | [02-finalize.md](skills/03-prd/actions/02-finalize.md) | - |
| `assets` | [prd-template.md](skills/03-prd/assets/prd-template.md) | - |
| `-` | [SKILL.md](skills/03-prd/SKILL.md) | `Generate a structured Product Requirements Document from a need, idea, or brainstorm, confirmed before save. Use when the user wants to draft or generate a PRD or product requirements. Not for user stories or a technical plan.` |

#### `skills/04-spec`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-build.md](skills/04-spec/actions/01-build.md) | - |
| `actions` | [02-refine.md](skills/04-spec/actions/02-refine.md) | - |
| `assets` | [spec-template.md](skills/04-spec/assets/spec-template.md) | - |
| `references` | [tbd-marker.md](skills/04-spec/references/tbd-marker.md) | - |
| `-` | [SKILL.md](skills/04-spec/SKILL.md) | `Generate or refine a spec, a feature's immutable contract, from a request, a PRD, or review findings. Use when the user wants to draft or refine a spec. Not for writing code, a full PRD, or changing a locked spec.` |

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
| `references` | [relations.md](skills/05-spike/references/relations.md) | - |
| `-` | [SKILL.md](skills/05-spike/SKILL.md) | `Produces an evidence-bounded spike for an uncertainty blocking estimation, feasibility, or design. Use when the user wants to frame, investigate, resume, or conclude one. Not for general research or implementation.` |

#### `skills/06-product-brief`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-frame.md](skills/06-product-brief/actions/01-frame.md) | - |
| `actions` | [02-discover.md](skills/06-product-brief/actions/02-discover.md) | - |
| `actions` | [03-visualize.md](skills/06-product-brief/actions/03-visualize.md) | - |
| `actions` | [04-shape.md](skills/06-product-brief/actions/04-shape.md) | - |
| `actions` | [05-finalize.md](skills/06-product-brief/actions/05-finalize.md) | - |
| `assets` | [product-brief.md](skills/06-product-brief/assets/product-brief.md) | - |
| `references` | [brief-quality.md](skills/06-product-brief/references/brief-quality.md) | - |
| `references` | [evidence.md](skills/06-product-brief/references/evidence.md) | - |
| `references` | [handoffs.md](skills/06-product-brief/references/handoffs.md) | - |
| `references` | [persistence.md](skills/06-product-brief/references/persistence.md) | - |
| `references` | [techniques.md](skills/06-product-brief/references/techniques.md) | - |
| `references` | [visuals.md](skills/06-product-brief/references/visuals.md) | - |
| `-` | [SKILL.md](skills/06-product-brief/SKILL.md) | `Produces a concise Product Brief before requirements. Use when the user wants to frame or revisit a product opportunity and how it will be validated. Not for requirements, technical design, or planning.` |

#### `skills/07-epic`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-shape.md](skills/07-epic/actions/01-shape.md) | - |
| `actions` | [02-review.md](skills/07-epic/actions/02-review.md) | - |
| `actions` | [03-finalize.md](skills/07-epic/actions/03-finalize.md) | - |
| `assets` | [epic-template.md](skills/07-epic/assets/epic-template.md) | - |
| `references` | [handoffs.md](skills/07-epic/references/handoffs.md) | - |
| `references` | [lifecycle.md](skills/07-epic/references/lifecycle.md) | - |
| `references` | [persistence.md](skills/07-epic/references/persistence.md) | - |
| `references` | [qualification.md](skills/07-epic/references/qualification.md) | - |
| `references` | [readiness.md](skills/07-epic/references/readiness.md) | - |
| `references` | [relations.md](skills/07-epic/references/relations.md) | - |
| `-` | [SKILL.md](skills/07-epic/SKILL.md) | `Produces or refines an outcome-based Epic for a product backlog. Use when the user wants to frame, review, resume, or persist an Epic. Not for Product Briefs, User Stories, or implementation.` |

#### `skills/08-three-amigos`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-assess.md](skills/08-three-amigos/actions/01-assess.md) | - |
| `actions` | [02-reconcile.md](skills/08-three-amigos/actions/02-reconcile.md) | - |
| `references` | [assessment.md](skills/08-three-amigos/references/assessment.md) | - |
| `references` | [reconciliation.md](skills/08-three-amigos/references/reconciliation.md) | - |
| `-` | [SKILL.md](skills/08-three-amigos/SKILL.md) | `Assesses an Epic or Story through one product, delivery, or quality lens, then reconciles three caller-supplied reports. Use when the user wants to refine one before a backlog change. Not for spawning or writing.` |

#### `skills/09-defect`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-capture.md](skills/09-defect/actions/01-capture.md) | - |
| `actions` | [02-assess.md](skills/09-defect/actions/02-assess.md) | - |
| `actions` | [03-finalize.md](skills/09-defect/actions/03-finalize.md) | - |
| `assets` | [defect-template.md](skills/09-defect/assets/defect-template.md) | - |
| `references` | [handoffs.md](skills/09-defect/references/handoffs.md) | - |
| `references` | [lifecycle.md](skills/09-defect/references/lifecycle.md) | - |
| `references` | [persistence.md](skills/09-defect/references/persistence.md) | - |
| `references` | [qualification.md](skills/09-defect/references/qualification.md) | - |
| `references` | [readiness.md](skills/09-defect/references/readiness.md) | - |
| `references` | [relations.md](skills/09-defect/references/relations.md) | - |
| `-` | [SKILL.md](skills/09-defect/SKILL.md) | `Produces or refines a backlog Defect from an observed product mismatch. Use when the user wants to report, assess, link, order, transition, or verify a defect. Not for incident response, debugging, or implementation.` |

#### `skills/10-task`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-frame.md](skills/10-task/actions/01-frame.md) | - |
| `actions` | [02-review.md](skills/10-task/actions/02-review.md) | - |
| `actions` | [03-finalize.md](skills/10-task/actions/03-finalize.md) | - |
| `assets` | [task-template.md](skills/10-task/assets/task-template.md) | - |
| `references` | [handoffs.md](skills/10-task/references/handoffs.md) | - |
| `references` | [lifecycle.md](skills/10-task/references/lifecycle.md) | - |
| `references` | [persistence.md](skills/10-task/references/persistence.md) | - |
| `references` | [qualification.md](skills/10-task/references/qualification.md) | - |
| `references` | [readiness.md](skills/10-task/references/readiness.md) | - |
| `references` | [relations.md](skills/10-task/references/relations.md) | - |
| `-` | [SKILL.md](skills/10-task/SKILL.md) | `Produces or refines a backlog Task for bounded delivery work without independent user value. Use when the user wants to create, link, order, estimate, transition, or complete one. Not for User Stories, Spikes, Defects, or implementation.` |

