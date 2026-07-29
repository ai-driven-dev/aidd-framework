---
name: 03-prd
description: Generate a structured Product Requirements Document from a need, idea, or brainstorm, confirmed before save. Use when the user wants to draft or generate a PRD or product requirements. Not for user stories or a technical plan.
---

# PRD

Drafts a structured Product Requirements Document covering scope, goals, and acceptance criteria.

## Actions

| #   | Action  | Role                                                 | Input                                           |
| --- | ------- | ---------------------------------------------------- | ----------------------------------------------- |
| 01  | `prd`   | Parse input, draft per template, validate, save      | feature_description, user_stories (optional)    |

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Focus on what and why; never include technical implementation detail.
- Sections stay concise and actionable.
- Always wait for explicit user validation before saving.
- Save path: `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`.
- Source of truth for structure: `assets/prd-template.md`.

## Assets

- `assets/prd-template.md`: PRD body template.
- `assets/task-template.md`: Lightweight task template referenced from the PRD when needed.
