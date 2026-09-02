---
status: pending
---

# Instruction: Root rule, behavior over instructions

Part of [`plan.md`](./plan.md).

## Architecture projection

```txt
plugins/aidd-context/skills/04-skill-generate/references/
  ✏️ skill-authoring.md   # add the Steinberger rule (new R)
```

## Tasks to do

### `1)` Add the behavior-over-instructions rule

> Codify the pivot as an authoring rule every generator reads.

1. Add a new `R` to `skill-authoring.md`: an action describes the behavior and the qualify-if bar, never a slot-fill checklist. A template section states what qualifies it and omits when nothing does.
2. State the anti-slop consequence in one line: an empty slot is omitted, never invented.
3. Keep it inside the existing R-list numbering and voice; no new file.

## Test acceptance criteria

| Task | Acceptance criteria                                                                 |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | `skill-authoring.md` carries a rule that says describe behavior + qualify-if/omit, and forbids inventing content for an empty section. |
