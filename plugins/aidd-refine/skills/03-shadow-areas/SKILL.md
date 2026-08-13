---
name: 03-shadow-areas
description: Scan a markdown artifact (idea, stories, PRD, spec) for blind spots into a shadow report grouped by category and severity. Use to find gaps or what is missing in a written artifact. Not for interactive Q&A or code review.
argument-hint: file | text
---

# Shadow Areas

Analytically scans a written artifact for gaps the author has not addressed. Unlike iterative Q&A clarification, this skill reads the existing material and emits a structured report: each gap carries a category from a locked 7-category taxonomy, a 3-tier severity, and a direct-question probe the author can act on immediately.

## Actions

| #   | Action           | Role                                                                     | Input                                    |
| --- | ---------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| 01  | `detect`         | Parse input, extract gaps, classify category and severity, emit probes   | file path or inline text                 |
| 02  | `render-report`  | Render markdown grouped by category and sorted by severity, write report | gap list from detect                     |
| 03  | `diff`           | Load prior report, classify gaps as closed / still-open / newly-introduced | gap list from detect + prior report path |

Dispatch by context: with no prior report run `detect` then `render-report`; with one, run `detect` then `diff`.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Never modify the source artifact.
- Every gap carries all three: a category, a severity, and a probe question.
- Every probe is a direct question ending with `?`.
- Categories and severities come from the locked sets in `references/locked-sets.json`.
- When zero blockers and zero majors remain, stamp the report `status: clean`.
- On re-runs, gaps are matched by category and snippet, never by question wording, so rephrasing a question never creates a spurious "newly introduced" gap.

## References

- `references/categories.md`: locked 7-category taxonomy with definition and example per category.
- `references/severity-rubric.md`: blocker / major / minor decision rules and examples.
- `references/probe-style.md`: direct-question form rules.
- `references/locked-sets.json`: machine-readable sets reused by the validator.

## Assets

- `assets/report-template.md`: report skeleton with header, per-category sections, and `status: clean` block.
