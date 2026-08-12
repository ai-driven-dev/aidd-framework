---
name: 10-learn
description: Capture durable project learnings. Use when the user wants to remember, record, or formalize a decision, convention, lesson, pitfall, reusable workflow, or review finding. Not for preferences or temporary notes.
argument-hint: conversation | file | diff | review
---
# Learn

```mermaid
flowchart LR
  source --> gather --> assess --> write
  source -->|"missing, empty, or ambiguous"| sourceStop([stop])
  gather -->|"no candidates"| gatherEnd([end])
  assess -->|"all covered"| assessEnd([end])
  write -->|"memory or ADR"| sync
  write -->|"rule or skill"| handoff([handoff])
  sync -->|"failure"| syncStop([stop])
```

## Actions

Run the flow above. Read only the next action file.

| Action | Does |
| ------ | ---- |
| source | identify and challenge the origin |
| gather | read the origin and extract candidates |
| assess | score, reconcile, show, and confirm |
| write | write or hand off approved lessons |
| sync | refresh memory references |

## Transversal rules

- Write only the user-approved plan.
- Preserve user edits and touch affected files only.
- Write project files only, never personal or global memory.
