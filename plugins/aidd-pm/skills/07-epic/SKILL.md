---
name: 07-epic
description: Produces or refines an outcome-based Epic for a product backlog. Use when the user wants to frame, review, resume, or persist an Epic. Not for Product Briefs, User Stories, or implementation.
argument-hint: request | epic
---

# Epic

```mermaid
flowchart LR
  source([request, Product Brief, PRD, or Epic]) --> shape --> review --> finalize
  review -->|"revise"| shape
  review -->|"investigate, then resume"| review
  finalize -->|"revise"| shape
  finalize -->|"authorized"| done([Epic])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                  |
| -------- | ------------------------------------- |
| shape    | frame one outcome-based Epic          |
| review   | challenge its coherence and readiness |
| finalize | approve, persist, and hand off         |

## Transversal rules

- Keep product and backlog decisions with the user.
- Separate evidence, decisions, and assumptions.
- Stay at outcome level; do not propose child slices or implementation.
- Ask natural questions; never expose actions, checks, routes, skipped work, or unchanged state.
- Preserve source links and existing edits.
- Require explicit approval or caller-provided bounded authority before any write or related-item change.
