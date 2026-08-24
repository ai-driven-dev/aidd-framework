---
name: 02-design
description: Creates or revises an AIDD ui.md experience contract. Use when the user wants implementation ready feature UI decisions versioned from product intent and current evidence. Not for shared system governance, review findings, or source implementation.
argument-hint: create | revise
---

# UI Design

```mermaid
flowchart LR
  create([create]) --> frame
  revise([revise]) --> frame
  frame -->|blocking intent gap| stopped([stopped])
  frame --> inspect
  inspect -->|no UI target or scope conflict| stopped
  inspect --> specialize --> structure --> compose --> write --> verify
  write -->|lock, archive, revision, or recovery conflict| stopped
  verify -->|lock, receipt, or revision conflict| stopped
  verify -->|ready| ready([ready contract])
  verify -->|unresolved| draft([draft contract])
  verify -->|content defect| compose
  verify -->|serialization or version defect| write
```

## Actions

Read only the next action file required by the flow above.

| Action | Does |
| --- | --- |
| frame | isolate the feature intent |
| inspect | resolve existing UI authority |
| specialize | obtain applicable specialist decisions |
| structure | define feature structure and states |
| compose | decide the feature experience |
| write | record the versioned UI contract |
| verify | prove contract readiness |

## Transversal rules

- Own feature-local experience decisions.
- Reference shared system decisions by exact revision.
- In revise mode, preserve information architecture and task flow unless the source explicitly authorizes changing them.
- Preserve factual or legal meaning unless the source explicitly authorizes changing it.
- Never modify application source, UI system contracts, or project memory.
