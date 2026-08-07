---
name: 10-learn
description: Capture durable project learnings. Use when the user wants to remember, record, or formalize a decision, convention, lesson, pitfall, reusable workflow, or review finding. Not for preferences or temporary notes.
argument-hint: conversation | file | diff | review
---
# Learn

```mermaid
flowchart LR
  source --> gather --> assess --> write
  write -->|"memory or ADR"| sync
  write -->|"rule or skill"| handoff([handoff])
```

## Actions

Run the flow above. Read only the next action file.

| Action | Does |
| ------ | ---- |
| source | identify and challenge the origin |
| gather | read the origin and extract candidates |
| assess | score, reconcile, and confirm |
| write | write or hand off approved lessons |
| sync | refresh memory references |

## Transversal rules

- Write only the user-approved plan.
- Preserve user edits and touch affected files only.
- Write project files only, never personal or global memory, never scaffold `aidd_docs/memory/` yourself.
