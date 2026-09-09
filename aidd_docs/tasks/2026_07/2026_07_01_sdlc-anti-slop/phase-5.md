---
status: pending
---

# Instruction: Review redesign, trace phases as checkboxes

Part of [`plan.md`](./plan.md).

## Architecture projection

```txt
plugins/aidd-dev/skills/05-review/
  ✏️ assets/review-template.md      # phases as checkboxes, verification line, no prose/follow-up
  ✏️ actions/02-review-functional.md # trace the plan's phases, not a free criterion table
  ✏️ SKILL.md                        # point sections at the new template shape
```

## Tasks to do

### `1)` Rebuild the review template

> A skimmable gate a human reads in one pass.

1. Structure the report around the plan's phases: one category per phase, each acceptance criterion a checked or unchecked box.
2. End with a verification line: percent verified, the files checked, and a fix / not-applicable / fixed status per unchecked item.
3. Delete the prose blocks and the Follow-up section; the verdict line and the boxes carry the signal.

### `2)` Point the actions at it

> The functional axis follows the plan.

1. Rewrite `02-review-functional.md` to trace the plan's phases and their acceptance criteria, not an ad-hoc criterion list.
2. Update `SKILL.md` section wording to match the new template.

## Test acceptance criteria

| Task | Acceptance criteria                                                                     |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | `review.md` shows one category per plan phase with checked/unchecked boxes and a final verification line. |
| 1    | The template carries no Follow-up section and no prose paragraph.                        |
| 2    | `02-review-functional.md` traces the plan's phases; a review of a phased plan lists every phase. |
