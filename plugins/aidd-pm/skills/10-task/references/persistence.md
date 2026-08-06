# Persistence

| Situation | Result |
| --- | --- |
| explicit Task target | use it |
| existing Task | preserve its support and identity |
| parent has an authoritative Task support | use it |
| several targets remain | ask |
| no target remains | ask session or Markdown |
| equivalent Task exists | reuse or update it |
| no match exists | create one Task |

Use native fields when supported; otherwise use stable ids, URLs, or project-relative paths. Keep one authority across supports.

For Markdown, write `aidd_docs/backlog/tasks/<slug>.md`, the title in kebab-case.

Markdown is the only support these skills write today. Naming another one is a project's own integration.
