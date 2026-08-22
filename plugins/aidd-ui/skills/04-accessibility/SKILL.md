---
name: 04-accessibility
description: Defines interface accessibility requirements or reviews an interface against observable evidence. Use when the user wants focused semantic, keyboard, focus, naming, contrast, error, touch, or motion decisions.
argument-hint: define | review
---

# Accessibility

```mermaid
flowchart LR
  define([define]) --> inspect --> specify --> requirements([accessibility requirements])
  review([review]) --> inspect --> assess
  assess -->|defects| findings([accessibility findings])
  assess -->|none observed| clean([no findings])
  inspect -. no-evidence .-> unknown([evidence gap])
```

## Actions

Read only the next action file required by the flow above.

| Action  | Does                                      |
| ------- | ----------------------------------------- |
| inspect | collect interface accessibility evidence |
| specify | define applicable accessibility behavior |
| assess  | report evidenced accessibility defects   |

## Transversal rules

- Enforce the project's confirmed accessibility bar before adding a new one.
- Evaluate only concerns that apply to the interface and available evidence.
- Never modify application source or project memory.
