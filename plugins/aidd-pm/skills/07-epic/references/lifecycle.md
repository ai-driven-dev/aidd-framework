# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| --- | --- | --- |
| `proposed` | captured but not ready | `ready`, `cancelled` |
| `ready` | outcome and bounds support decomposition | `proposed`, `in-progress`, `cancelled` |
| `in-progress` | child work is pursuing the outcome | `ready`, `done`, `cancelled` |
| `done` | success evidence confirms the outcome | terminal |
| `cancelled` | outcome is no longer pursued | terminal |

Closing every child does not complete an Epic without its success evidence.
A changed outcome creates a new Epic and preserves the terminal one.
