---
name: 04-prd
description: Generates a structured Product Requirements Document from a request, user stories, or a Product Brief. Use when the user wants to draft product requirements. Not for product discovery, technical design, or implementation planning.
---

# PRD

```mermaid
flowchart LR
  source([request or discovery]) --> draft --> approve --> write
  approve -->|"revise"| draft
```

## Actions

| Action | Does                               |
| ------ | ---------------------------------- |
| prd    | draft, confirm, and save the PRD   |

Read the action file before running it.

## Transversal rules

- Focus on what and why; never include technical implementation detail.
- Require explicit approval before saving.
- Preserve user edits and touch only the resolved task folder.

## Assets

- `assets/prd-template.md`: PRD body template.
- `assets/task-template.md`: Lightweight task template referenced from the PRD when needed.
