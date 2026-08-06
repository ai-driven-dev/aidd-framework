# Persistence

| Situation | Result |
| --- | --- |
| explicit target | use it |
| existing Epic | keep its support and identity |
| source has a configured backlog | use that backlog |
| several targets remain | ask the user |
| no target remains | ask session or Markdown; do not report the missing target |
| equivalent Epic exists | reuse or update it |
| overlapping Epic exists | show the overlap before proceeding |
| no match exists | create one Epic |

Use native relation fields when supported. Otherwise keep explicit ids or project-relative paths. Never mirror the same Epic across supports.

Write a Markdown Epic to `aidd_docs/backlog/epics/<slug>.md`, the title in kebab-case.

Updating an Epic preserves its identity; it does not relate the Epic to itself.

Markdown is the only support these skills write today. Naming another one is a project's own integration.
