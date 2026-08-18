---
status: pending
---

# Instruction: Gates single-home + SDLC assert step

Part of [`plan.md`](./plan.md).

## Architecture projection

```txt
plugins/aidd-dev/skills/00-sdlc/
  ✏️ SKILL.md   # insert an assert step between implement and review
```

## Tasks to do

### `1)` Chain assert in the orchestrator

> The gate must run once gates leave the plan.

1. Add an assert step to the `00-sdlc` action table, delegating to `aidd-dev:03-assert`, between `implement` and `review`.
2. Update the run order and the iterate loop so a failed assert loops back to implement.
3. Confirm no SDLC template or action restates build/test/typecheck commands; those stay in `coding-assertions.md`.

## Test acceptance criteria

| Task | Acceptance criteria                                                        |
| ---- | ------------------------------------------------------------------------- |
| 1    | `00-sdlc` runs implement → assert → review; a failed assert returns to implement. |
| 1    | No SDLC skill file lists a build or test command; the gate reads `coding-assertions.md`. |
