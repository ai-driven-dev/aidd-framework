# Persistence

Write `product-brief.md` under `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<product-slug>/`.
Every changed brief has a non-empty `objective` and one listed status.

| Situation | Files | Frontmatter |
| --- | --- | --- |
| No brief matches | create one | `status: current`; omit `supersedes` |
| Revise the current brief | update one | keep `status: current` and any existing `supersedes` |
| Replace the current brief | create new, update old | new: `current` + `supersedes`; old: `superseded` |

Relation values are project-relative paths.
