# Persistence

Write `aidd_docs/product/<product-slug>.md`. Every changed brief has a non-empty `objective` and one listed revision.

| Situation | Files | Revision |
| --- | --- | --- |
| No brief matches | create one | `current`; omit `supersedes` |
| Revise the current brief | update one | keep `current` and any existing `supersedes` |
| Replace the current brief | create new, update old | new: `current` + `supersedes`; old: `superseded` |

Relation values are project-relative paths.
