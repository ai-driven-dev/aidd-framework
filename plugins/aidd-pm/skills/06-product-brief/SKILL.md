---
name: 06-product-brief
description: Produces a concise Product Brief before requirements. Use when the user wants to frame or revisit a product opportunity and how it will be validated. Not for requirements, technical design, or planning.
argument-hint: idea | product
---

# Product Brief

```mermaid
flowchart LR
  source([idea or product]) --> frame
  frame --> discover
  discover -->|"ready or assumptions accepted"| shape
  discover -->|"visual helps"| visualize
  visualize -->|"accepted or skipped"| shape
  shape -->|"evidence gap"| discover
  shape --> finalize
  finalize -->|"learn more"| discover
  finalize -->|"change visual"| visualize
  finalize -->|"revise brief"| shape
  finalize -->|"authorized"| done([Product Brief])
```

## Actions

Run the flow above. Read only the next action file.

| Action    | Does                                 |
| --------- | ------------------------------------ |
| frame     | establish scope and evidence path    |
| discover  | research, question, and challenge    |
| visualize | clarify with an optional product view |
| shape     | compose one Product Brief            |
| finalize  | refine, approve, and persist          |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- Frame the opportunity; never write requirements.
