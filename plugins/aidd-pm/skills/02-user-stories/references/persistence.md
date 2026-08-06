# Persistence

| Situation | Result |
| --- | --- |
| explicit Story target | use it |
| existing Stories | keep their support and identities |
| parent Epic | derive the support; never write Story content into it |
| several targets remain | ask the user |
| no target remains | ask session or Markdown; do not report the missing target |
| equivalent Story exists | reuse or update it |
| no match exists | create one Story |

Use native fields when supported; otherwise use explicit ids or project-relative paths. Never mirror one Story across supports.

Write each Markdown Story to its own `aidd_docs/backlog/stories/<slug>.md` file, the title in kebab-case.

Markdown is the only support these skills write today. Naming another one is a project's own integration.
