# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| --- | --- | --- |
| `reported` | mismatch captured but not actionable | `ready`, `cancelled` |
| `ready` | evidence and resolution proof are sufficient | `reported`, `in-progress`, `cancelled` |
| `in-progress` | resolution work is active | `ready`, `done`, `cancelled` |
| `done` | verification proves expected behavior | terminal |
| `cancelled` | duplicate, invalid, obsolete, or no longer pursued | terminal |

A changed mismatch creates a new Defect. A duplicate is cancelled only after the retained identity is known.
