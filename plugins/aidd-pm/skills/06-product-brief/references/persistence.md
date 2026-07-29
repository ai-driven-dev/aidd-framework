# Persistence

Write `product-brief.md` under `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<product-slug>/`.
Every changed brief has a non-empty `objective` and one listed status.

| Situation | Files | Frontmatter |
| --- | --- | --- |
| No brief matches | create one | `status: current`; omit both relation fields |
| Revise the current brief | update one | keep `status: current` and any existing `supersedes`; omit `superseded_by` |
| Replace the current brief | create new, update old | new: `current` + `supersedes`; old: `superseded` + `superseded_by` |

Relation values are project-relative paths.
