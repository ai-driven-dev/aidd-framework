---
name: 07-handoff
description: Compiles confirmed UI decisions into a minimal implementation-ready experience contract. Use when the user wants to hand interface behavior and constraints to engineering. Not for inventing product requirements, redesigning, or writing production code.
argument-hint: decisions | feature
---

# UI Handoff

```mermaid
flowchart LR
  source([confirmed decisions]) --> compile --> verify --> ready([ui contract])
  compile -. existing contract .-> replace([replacement confirmation])
  replace -->|approved| compile
  replace -->|declined| preserved([existing contract preserved])
  verify -. missing decision .-> confirm([decision confirmation])
  confirm -->|resolved| compile
  confirm -->|unresolved| blocked([handoff blocked])
```

## Actions

Read only the next action file required by the flow above.

| Action  | Does                            |
| ------- | ------------------------------- |
| compile | write the experience contract   |
| verify  | remove implementation ambiguity |

## Transversal rules

- Compile confirmed decisions; never invent missing product or experience choices.
- Preserve engineering freedom beyond observable experience constraints.
- Never modify application source or project memory.
