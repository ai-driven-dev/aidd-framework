# Persistence

| Situation | Result |
| --- | --- |
| parents span supports | ask for one target |
| parent support exists | use that support |
| no parent artifact exists | use the configured backlog |
| no target exists | ask for one |
| valid completed match in the target | reuse it |
| same open question in the target | resume it |
| new spike | create one item or Markdown document |
| question changed | cancel the previous Spike, then create one that `supersedes` it |

For Markdown, write `aidd_docs/backlog/spikes/<slug>.md`, the title in kebab-case. Blocked work is found by scanning `parents`. Use native tracker relations when available, but never mirror a relation or artifact across supports.

Markdown is the only support these skills write today. Naming another one is a project's own integration.
