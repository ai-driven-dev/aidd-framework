---
name: 03-prd
description: Generate a structured Product Requirements Document from a need, idea, or brainstorm, confirmed before save. Use when the user wants to draft or generate a PRD or product requirements. Not for user stories or a technical plan.
argument-hint: need | brainstorm
---

# PRD

```mermaid
flowchart LR
  source([feature description, optionally with user stories]) --> draft --> finalize --> done([saved PRD])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                 |
| -------- | -------------------------------------- |
| draft    | draft per template, iterate to approval |
| finalize | save the approved draft                |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- State what and why; never a technical plan or user stories.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-pm:03-prd"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
