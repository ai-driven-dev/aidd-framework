---
status: pending
---

# Instruction: Plan + phases anti-slop

Part of [`plan.md`](./plan.md).

## Architecture projection

```txt
plugins/aidd-dev/skills/01-plan/
  ✏️ assets/plan-template.md    # decisions = magnitude, resources = URLs/files
  ✏️ assets/phase-template.md   # wireframe omit-guard, acceptance = observable, drop header redirect
  ✏️ actions/04-plan.md         # qualify-if/omit behavior
  ✏️ actions/03-wireframe.md    # only when the phase has UI
```

## Tasks to do

### `1)` Qualify each plan section

> Every table earns its rows or omits.

1. Decisions: qualify bar = "you would regret reversing it" (architecture magnitude). Small choices are omitted, not recorded.
2. Resources: external URLs consulted, in the plan; modified files belong to the phase, not the plan resources table.
3. Phase acceptance criteria: observable behavior only; a build/test command is a gate, never an acceptance criterion.

### `2)` Trim the phase

> Cut what no reader uses.

1. Wireframe section: keep the `omit when no UI` guard and make `03-wireframe` run only for a UI phase.
2. Drop the redundant "Part of plan.md" redirect if it carries no navigation value, or justify keeping it in one line.
3. Rewrite `04-plan.md` to the qualify-if/omit behavior from phase 1.

## Test acceptance criteria

| Task | Acceptance criteria                                                              |
| ---- | ------------------------------------------------------------------------------- |
| 1    | Templates state the qualify bar for decisions, resources, and acceptance criteria. |
| 1    | Acceptance-criteria guidance forbids a bare command as a criterion.             |
| 2    | A no-UI phase produces no Wireframe section; `03-wireframe` self-skips without UI. |
