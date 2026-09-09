---
status: pending
---

# Instruction: Spec done-when as observable conditions

Part of [`plan.md`](./plan.md).

## Architecture projection

```txt
plugins/aidd-pm/skills/04-spec/
  ✏️ assets/spec-template.md   # done-when = observable condition, qualify-if guidance
  ✏️ actions/01-build.md       # behavior, not slot-fill
```

## Tasks to do

### `1)` Discipline done-when

> One observable condition per line, no user-story scaffolding.

1. Rewrite the Done-when block guidance: each item is an observable condition (what a user or system can be seen doing), not a command and not a feeling.
2. Confirm the plan references the spec done-when rather than recopying it (contract owns it).
3. Update `01-build.md` so it describes the qualify bar per section and omits an empty one, per the phase-1 rule.

## Test acceptance criteria

| Task | Acceptance criteria                                                            |
| ---- | ----------------------------------------------------------------------------- |
| 1    | Done-when items read as observable conditions; the template shows no command as a done-when. |
| 1    | `01-build.md` instructs qualify-if/omit, carrying no fill-every-slot wording. |
