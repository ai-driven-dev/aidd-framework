---
name: 05-review
description: Review a diff read-only on three axes, code, behavior versus the plan, and relevancy, into one verdict report. Use before shipping a change. Not for fixing findings or auditing a codebase.
argument-hint: diff | plan
model: opus
---

# Skill: review

Read-only review of a diff along three axes, code quality, feature behavior, and relevancy, composed into one report.

## Actions

| #   | Action              | Axis                                                              |
| --- | ------------------- | ---------------------------------------------------------------- |
| 01  | `review-code`       | Clean-code quality on the changed lines                          |
| 02  | `review-functional` | The diff against the plan's phases and their acceptance criteria |
| 03  | `review-relevancy`  | Does the change belong: fit to the need, rule conformance, no rot |

Run all three by default, composing one report. Run a single axis only when the caller names it; if it is unclear whether they want all or one, ask. Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Read-only: surface each finding with its fix described, never patch.
- Output: always write `review.md` to disk; the file is the deliverable, never an inline-only verdict.
- Folder: write into the reviewed work's feature folder (`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<slug>/`, beside `plan.md`), or one resolved from the change when it has none.
- Report: fill `review.md` from `assets/review-template.md`. One shared `Findings` table for every axis: functional writes the `Phases` boxes and the `Verification` table, and appends a `functional` row to `Findings` for each unmet criterion tagged `fix`; code and relevancy append rows to `Findings` under their `Kind`. Tables and boxes, no prose, no per-axis sections. The Phase column ties a finding to the plan when one is in scope, `-` otherwise.
- Sections: the report has exactly the sections in `assets/review-validator.yml`. Before returning, verify against it and remove any section not listed.
- Not run: every required section always exists. The header `Axes run` lists which axes ran, so a skipped code or relevancy axis is visible even though `Findings` is shared. An axis that did not run marks the sections it owns "Not run" (functional owns `Phases` and `Verification`); it never leaves a placeholder or invents data.
- Re-run: overwrite `review.md` with the current review. It is a snapshot of the current diff, not a history; a later review of the same work replaces the earlier one.
- Verdict: one overall verdict, the strictest across the axes run, per `references/review-rubric.md`.

## References

- `references/review-rubric.md`: the severity scale, the verdict rule, the code categories, and the relevancy lenses.

## Assets

- `assets/review-template.md`: the single report the three axes fill.
- `assets/review-validator.yml`: the closed set of report sections.
