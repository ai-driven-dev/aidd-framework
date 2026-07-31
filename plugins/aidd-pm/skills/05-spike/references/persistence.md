# Persistence

| Situation | Result |
| --- | --- |
| Parents span supports | Ask for one target |
| Parent support exists | Use that support |
| No parent artifact exists | Use the configured backlog |
| No target exists | Ask for one |
| Valid completed match in the target | Reuse it |
| Same open question in the target | Resume it |
| New spike | Create one dedicated tracker item or Markdown document |
| Question changed | Cancel the previous Spike; create a new one that `supersedes` it |

For Markdown, write `aidd_docs/backlog/spikes/<slug>.md`. Blocked work is found by scanning `parents`. Use native tracker relations when available, but never mirror a relation or artifact across supports.

Assign neither user value nor arbitrary estimates.
