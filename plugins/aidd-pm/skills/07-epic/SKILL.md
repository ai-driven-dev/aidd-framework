---
name: 07-epic
description: Produces or refines an outcome-based Epic for a product backlog. Use when the user wants to frame, review, resume, or persist an Epic. Not for Product Briefs, User Stories, or implementation.
argument-hint: request | epic
---

# Epic

```mermaid
flowchart LR
  source([request, Product Brief, PRD, or Epic]) --> shape --> review --> finalize
  source -->|"already persisted"| finalize
  review -->|"revise"| shape
  finalize -->|"revise"| shape
  finalize -->|"authorized"| done([Epic])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                  |
| -------- | ------------------------------------- |
| shape    | frame one outcome-based Epic          |
| review   | challenge its coherence and readiness |
| finalize | approve, persist, or transition             |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- Stay at outcome level; do not propose child slices or implementation.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-pm:07-epic"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
