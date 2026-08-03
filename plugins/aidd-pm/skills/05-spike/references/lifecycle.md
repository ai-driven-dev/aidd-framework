# Lifecycle

`status` lives in frontmatter.

| Status | Meaning | May move to |
| ------ | ------- | ----------- |
| `open` | framed only | `in-progress`, `cancelled` |
| `in-progress` | collecting evidence | `blocked`, `resolved`, `inconclusive`, `cancelled` |
| `blocked` | dependency stops the next check | `in-progress`, `cancelled` |
| `resolved` | decision settled, including proven impossibility | terminal |
| `inconclusive` | investigation stopped without an answer | `in-progress` with a new path |
| `cancelled` | decision gone, with the reason under `## Cancellation` | terminal |
