# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| --- | --- | --- |
| `proposed` | captured but not ready | `ready`, `cancelled` |
| `ready` | accepted for delivery | `proposed`, `in-progress`, `cancelled` |
| `in-progress` | actively being delivered | `ready`, `done`, `cancelled` |
| `done` | acceptance and the project's Definition of Done pass | terminal |
| `cancelled` | value is no longer pursued | terminal |

A changed need creates a new Story and preserves the completed one.
