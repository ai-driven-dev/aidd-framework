---
name: 05-responsive
description: Defines or reviews interface behavior under constrained space and changing input contexts. Use when the user wants explicit layout, density, navigation, action, overflow, touch, or breakpoint decisions.
argument-hint: define | review
---

# Responsive Behavior

```mermaid
flowchart LR
  define([define]) --> inspect --> specify --> rules([responsive rules])
  review([review]) --> inspect --> assess
  assess -->|defects| findings([responsive findings])
  assess -->|none observed| clean([no findings])
  inspect -. no-evidence .-> unknown([evidence gap])
```

## Actions

Read only the next action file required by the flow above.

| Action  | Does                                 |
| ------- | ------------------------------------ |
| inspect | map existing responsive conventions |
| specify | define constrained-space behavior   |
| assess  | report responsive behavior defects  |

## Transversal rules

- Preserve task priority and information hierarchy across space and input changes.
- Reuse confirmed breakpoints and layout primitives before extending them.
- Never modify application source or project memory.
