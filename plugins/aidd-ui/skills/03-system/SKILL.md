---
name: 03-system
description: Maps an existing interface system or defines its smallest coherent extension. Use when the user wants to discover design conventions or adapt them for a new interface need. Not for broad visual redesign or component implementation.
argument-hint: discover | extend
---

# Interface System

```mermaid
flowchart LR
  discover([discover]) --> inspect --> map --> current([system map])
  extend([extend]) --> inspect --> decide
  decide -->|existing surface fits| reused([reuse decision])
  decide -->|gap remains| delta([system delta])
  inspect -. no-ui .-> absent([no interface evidence])
```

## Actions

Read only the next action file required by the flow above.

| Action  | Does                                  |
| ------- | ------------------------------------- |
| inspect | locate the current interface system   |
| map     | summarize stable system conventions   |
| decide  | choose reuse or the smallest extension |

## Transversal rules

- Current repository evidence is authoritative when project memory drifts.
- Never modify application source or project memory.
- Keep separate frontend workspaces separate when their systems differ.
