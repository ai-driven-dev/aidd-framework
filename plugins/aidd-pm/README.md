← [aidd-framework](../../README.md)

# aidd-pm

Product management plugin for the AI-Driven Development framework.

> Status: stable.

First time? Install with `/plugin install aidd-pm@aidd-framework`, then invoke the artifact skill you need.

Covers backlog artifacts, refinement, lifecycle, Product Briefs, Epics, User Stories, Tasks, Spikes, Defects, requirements, and specs.

## How the backlog stays coherent

The bundled hooks judge the backlog for you, so no skill has to carry the checks. Before a write lands, `observe-backlog.js` compares the artifact on disk with the content about to replace it and refuses a status move no lifecycle allows, an artifact born already finished, a missing section, a field its type may not carry. When the turn ends, `verify-backlog.js` compares the graph the turn opened on with the graph now on disk, and reports what one write alone could never prove: a dangling target, a duplicate order, a live child under a closed parent, a cycle, a deleted artifact.

Both read `aidd_docs/backlog/**/*.md`, which is also where the skills write. A backlog held somewhere the hooks cannot read gets nothing from them.

### For a backlog the hooks cannot read

Such an owner may declare its change instead, by writing `.aidd/cache/backlog-transactions/<id>.json` before touching its support and completing it after readback. `hooks/backlog/canonical-transaction.js` then applies the same model to the declaration.

| Field | Holds |
| --- | --- |
| `version` | `1` |
| `transaction` | one id for this change |
| `phase` | `proposed` before the write, `applied` after the readback |
| `before` | every affected record as the support holds it now, `[]` when all are new |
| `proposed` | those same records as they should stand |
| `actual` | added at `applied`: the records as the support read them back |

A record holds `key`, a support-qualified `id`, `type`, `status`, the `relations` it owns by `key`, and `verified: true` once its owner has checked it. `order`, `estimate` and project `fields` are stated only when they apply. Nothing requires any of this today: no shipped skill writes outside Markdown.

## Skills

| Bracket ID | Skill | Description |
|---|---|---|
| [4.1] | [ticket-info](skills/01-ticket-info/SKILL.md) | Retrieve and display ticket information from the configured ticketing tool. |
| [4.2] | [user-stories](skills/02-user-stories/SKILL.md) | Slice and refine ordered User Stories without inventing estimates or priorities. |
| [4.3] | [prd](skills/03-prd/SKILL.md) | Generate a structured Product Requirements Document. |
| [4.4] | [spec](skills/04-spec/SKILL.md) | Generate and refine a project spec from a free-form human request. The spec is the immutable target a planner consumes. |
| [4.5] | [spike](skills/05-spike/SKILL.md) | Record or investigate an uncertainty that blocks estimation, feasibility, or design. |
| [4.6] | [product-brief](skills/06-product-brief/SKILL.md) | Produce one evidence-aware Product Brief. |
| [4.7] | [epic](skills/07-epic/SKILL.md) | Frame and manage one outcome-based Epic. |
| [4.8] | [three-amigos](skills/08-three-amigos/SKILL.md) | Assess Epic or Story refinement through product, delivery, and quality lenses. |
| [4.9] | [defect](skills/09-defect/SKILL.md) | Record, assess, and verify an observed product mismatch. |
| [4.10] | [task](skills/10-task/SKILL.md) | Record and manage bounded functional or technical delivery work. |
