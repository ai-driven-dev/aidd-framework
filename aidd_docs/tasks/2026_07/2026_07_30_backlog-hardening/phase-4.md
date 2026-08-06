---
status: done
---

# Instruction: a skill redirects instead of stopping

Five files restated the same routing table, and none of them used it: the actions
reading them said `stop`, never `offer`. So a request landing on the wrong skill
died there. Invoking `09-defect` with a feature request returned a refusal and no
direction.

`05-spike/references/capabilities.md` already solves this: find a capability by
need, name it by role, declare the expected result. No sibling definition, no
address, no path.

## Architecture projection

```txt
.
└── plugins/aidd-pm/skills/
    ├── {02-user-stories,07-epic,09-defect,10-task}/references/handoffs.md   ✅ where this skill sends what it refuses
    ├── {02-user-stories,07-epic,09-defect,10-task}/references/*quality*.md  ✏️ own threshold only
    └── {02-user-stories,07-epic,09-defect,10-task}/actions/01-*.md          ✏️ offer, then stop
```

## Tasks to do

### `1)` Give each skill its outgoing edges

> A skill knows where it sends what it refuses, not how the receiver decides.

1. Add `references/handoffs.md` per artifact skill: observed, capability by role, expected return.
2. Mark one-way handoffs apart from those that resume, so no agent waits for a Story that will never come back.

### `2)` Shrink qualification to its own threshold

> A skill defines itself, never its neighbours.

1. Keep the inclusion criterion and the duplicate case; drop every row defining another artifact.
2. Route the mismatch through `handoffs.md`.

### `3)` Offer instead of stopping

> The user keeps the decision; the skill never writes outside its artifact.

1. In each `01-frame`, `01-shape`, `01-capture`, replace the dead stop with the offered capability and what was observed.

## Test acceptance criteria

| Task | Acceptance criteria                                                              |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | Every artifact skill names where it sends a refused request                       |
| 1    | A handoff states whether the flow returns                                          |
| 2    | No qualification table defines an artifact its skill does not own                  |
| 3    | A feature request sent to the Defect skill is redirected, not refused              |
