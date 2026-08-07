---
name: 02-challenge
description: Rethink just-completed work against an agreed plan, classifying findings as deal-breaker, suggestion, or correct, with a confidence score. Use to challenge or critically review recent work. Not for line-by-line style review or writing code.
argument-hint: work
---

# Challenge

Rethink prior work and surface what is wrong, missing, or duplicated. Output a structured report with a confidence score so the user knows whether to ship, iterate, or rework.

## Actions

| #   | Action      | Role                                                          | Input                          |
| --- | ----------- | ------------------------------------------------------------- | ------------------------------ |
| 01  | `challenge` | Rethink prior work, classify findings, score confidence       | the work + agreed reference    |

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Reason from first principles, no logical gaps.
- Aim for simplifications. If the work can be smaller, say so.
- Fill `assets/report-template.md` verbatim.

## References

- `references/confidence-rubric.md`: tiered rubric for the confidence percentage.

## Assets

- `assets/report-template.md`: findings report skeleton, filled per run.
