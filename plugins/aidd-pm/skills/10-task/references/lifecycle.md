# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| --- | --- | --- |
| `proposed` | captured but not ready | `ready`, `cancelled` |
| `ready` | accepted for delivery | `proposed`, `in-progress`, `cancelled` |
| `in-progress` | actively delivered | `ready`, `done`, `cancelled` |
| `done` | completion evidence passes | terminal |
| `cancelled` | no longer needed, with the reason under `## Cancellation` | terminal |

A Task that changes state decides nothing for its parent: propose its fate with it.

A changed outcome creates a new Task and preserves the completed one.
