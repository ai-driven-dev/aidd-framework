---
name: 05-spike
description: Produces an evidence-bounded spike for an uncertainty blocking estimation, feasibility, or design. Use when the user wants to frame, investigate, resume, or conclude one. Not for general research or implementation.
argument-hint: question | spike
---

# Spike

```mermaid
flowchart LR
  source([question or Spike]) --> create
  source -->|"already persisted"| investigate
  create -->|"save for later"| done
  create -->|"investigate now"| investigate --> conclude
  conclude -->|"inconclusive"| investigate
  conclude --> done([Spike])
```

## Actions

Run the flow above. Read only the next action file.

| Action      | Does                                  |
| ----------- | ------------------------------------- |
| create      | qualify and persist                    |
| investigate | collect evidence                       |
| conclude    | write outcome and sync parents         |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- Bound the question; never answer beyond its stop condition.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-pm:05-spike"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
