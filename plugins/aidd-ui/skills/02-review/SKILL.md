---
name: 02-review
description: Produces prioritized, evidence-based findings about interface experience quality. Use when the user wants to review an existing screen, flow, or UI implementation. Not for general engineering correctness or code quality.
argument-hint: interface | flow
---

# UI Review

```mermaid
flowchart LR
  target([interface or flow]) --> inspect --> assess
  assess -->|defects| findings([prioritized findings])
  assess -->|none observed| clean([no findings])
  inspect -. no-evidence .-> unavailable([review unavailable])
```

## Actions

Read only the next action file required by the flow above.

| Action  | Does                              |
| ------- | --------------------------------- |
| inspect | collect observable UI evidence    |
| assess  | prioritize experience consequences |

## Transversal rules

- Review experience correctness, not general implementation quality.
- Never modify application source or project memory.
- State which review dimensions were covered and which lacked evidence.
