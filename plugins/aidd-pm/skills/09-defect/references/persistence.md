# Persistence

| Situation | Result |
| --- | --- |
| explicit Defect target | use it |
| existing Defect | keep its support and identity |
| source has a configured backlog | use that backlog |
| several targets remain | ask the user |
| no target remains | ask session or Markdown |
| same mismatch exists | reuse or update it |
| duplicate exists | retain one identity and link it |
| no match exists | create one Defect |

Use native fields when supported. Otherwise use stable ids, URLs, or project-relative paths without mirroring the artifact across supports.

Write each Markdown Defect to `aidd_docs/backlog/defects/<slug>.md`, the title in kebab-case.

Markdown is the only support these skills write today. Naming another one is a project's own integration.
