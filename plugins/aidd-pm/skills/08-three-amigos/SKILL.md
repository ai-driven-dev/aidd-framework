---
name: 08-three-amigos
description: Assesses an Epic or Story through one product, delivery, or quality lens, then reconciles three caller-supplied reports. Use for refinement before backlog changes. Never spawns or writes.
argument-hint: assess | reconcile
---

# Three Amigos

```mermaid
flowchart LR
  target([Epic or Story]) --> assess --> report([one role report])
  reports([three role reports]) --> reconcile --> result([findings, conflicts, questions])
```

## Actions

Run one route per invocation. Read only that action file.

| Action    | Does                                             |
| --------- | ------------------------------------------------ |
| assess    | apply one requested lens to an Epic or Story     |
| reconcile | reconcile three independent, caller-supplied reports |

## Transversal rules

- Never spawn, delegate, persist, or mutate.
- Treat roles as analytical lenses, not human authorities.
- Ground every finding and question in cited evidence; never invent a decision.
- Return proposals only; the caller decides what to do with them.
