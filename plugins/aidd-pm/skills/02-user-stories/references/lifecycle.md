# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| --- | --- | --- |
| `proposed` | captured but not ready | `ready`, `cancelled` |
| `ready` | accepted for delivery | `proposed`, `in-progress`, `cancelled` |
| `in-progress` | actively being delivered | `ready`, `done`, `cancelled` |
| `done` | acceptance passes, and the Definition of Done when project memory names one | terminal |
| `cancelled` | value is no longer pursued, with the reason under `## Cancellation` | terminal |

A Story that changes state decides nothing for its parent Epic, nor for the work parented to it: propose their fate with it.

A changed need creates a new Story and preserves the completed one.
