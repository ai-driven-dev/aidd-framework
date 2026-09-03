---
name: 02-implement
description: Write an existing plan's code, phase by phase, until every acceptance criterion holds. Use when a plan exists and needs implementing. Do NOT use to write a plan, review a diff.
argument-hint: plan
---

# Skill: implement

Run an existing plan to write its code, one phase at a time, until every acceptance criterion holds.

## Actions

| #   | Action     | Role                                            | Input         |
| --- | ---------- | ----------------------------------------------- | ------------- |
| 01  | `prepare`  | Resolve the plan, branch, mark it in-progress   | a plan path   |
| 02  | `execute`  | Loop the phases, code and assert each           | prepared plan |
| 03  | `finalize` | Verify and mark the plan implemented            | coded phases  |

Run them in order, `01 → 03`.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Status: drive the plan through `pending → in-progress → implemented` (or `blocked`), and each phase through `pending → in-progress → done`. The `in-progress` values are runtime markers; only `done` and `implemented` need to land in a commit.
- Commits: one commit per phase, its code together with the phase reaching `done`, plus a final commit for the plan reaching `implemented`. Never leave the tree dirty at a phase boundary. Do not scatter separate `in-progress` status commits: one context now owns both code and status, so there is nothing to guard against.

## References

- `references/blocked.md`: the conditions that make a plan `blocked` and need a human.
