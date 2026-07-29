---
name: 06-product-brief
description: Produces a concise Product Brief before requirements. Use when the user wants to frame or revisit a product opportunity and how it will be validated. Not for requirements, technical design, or planning.
argument-hint: idea | product
---

# Product Brief

```mermaid
flowchart LR
  start([idea or product]) --> frame
  frame --> discover
  discover -->|"open decision"| discover
  discover -->|"ready or assumptions accepted"| shape
  discover -->|"visual helps"| visualize
  visualize -->|"revise"| visualize
  visualize -->|"accepted or skipped"| shape
  shape -->|"evidence gap"| discover
  shape --> finalize
  finalize -->|"learn more"| discover
  finalize -->|"change visual"| visualize
  finalize -->|"revise brief"| shape
  finalize -->|"approved"| done([Product Brief])
```

## Actions

Run the flow above. Read only the next action's file before running it.

| Action    | Does                                 |
| --------- | ------------------------------------ |
| frame     | establish scope and evidence path    |
| discover  | research, question, and challenge    |
| visualize | clarify with an optional product view |
| shape     | compose one Product Brief            |
| finalize  | refine, approve, and persist          |

## Transversal rules

- Separate evidence, decisions, and assumptions.
- Keep product decisions with the user.
- Keep actions and technique names out of user-facing text.
