---
name: 06-polish
description: Produces a bounded visual and interaction refinement delta after structure and behavior are settled. Use when the user wants to improve hierarchy, rhythm, consistency, feedback, density, or affordance without redesigning the experience.
argument-hint: interface
---

# UI Polish

```mermaid
flowchart LR
  target([settled interface]) --> refine
  refine -->|refinements| delta([polish delta])
  refine -->|none evidenced| clean([no refinement needed])
  refine -. structural blocker .-> blocked([redesign required])
```

## Actions

Read only the next action file required by the flow above.

| Action | Does                                  |
| ------ | ------------------------------------- |
| refine | define bounded interface refinements |

## Transversal rules

- Polish follows settled intent, structure, behavior, accessibility, and responsive decisions.
- Never silently change information architecture or task flow.
- Never modify application source or project memory.
