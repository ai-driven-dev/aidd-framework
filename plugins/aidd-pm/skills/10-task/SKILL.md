---
name: 10-task
description: Produces or refines a backlog Task for bounded delivery work without independent user value. Use when the user wants to create, link, order, estimate, transition, or complete one. Not for User Stories, Spikes, Defects, or implementation.
argument-hint: request | task
---

# Task

```mermaid
flowchart LR
  source([request or Task]) --> frame --> review --> finalize
  source -->|"already persisted"| finalize
  review -->|"revise"| frame
  finalize -->|"revise"| frame
  finalize -->|"authorized"| done([Task])
```

## Actions

Run the flow above. Read only the next action file.

| Action | Does |
| --- | --- |
| frame | define one bounded delivery Task |
| review | challenge its type and readiness |
| finalize | persist or transition the Task |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- Record delivery work; never plan or implement it.
