---
name: 09-defect
description: Produces or refines a backlog Defect from an observed product mismatch. Use when the user wants to report, assess, link, order, transition, or verify a defect. Not for incident response, debugging, or implementation.
argument-hint: report | defect
---

# Defect

```mermaid
flowchart LR
  source([report or Defect]) --> capture --> assess --> finalize
  source -->|"already persisted"| finalize
  assess -->|"revise"| capture
  finalize -->|"revise"| capture
  finalize -->|"authorized"| done([Defect])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                      |
| -------- | ----------------------------------------- |
| capture  | frame one observed product mismatch       |
| assess   | establish evidence, impact, and readiness |
| finalize | persist or transition the Defect           |

## Transversal rules

- Keep product and lifecycle decisions with the user.
- Separate evidence, decisions, and assumptions.
- Preserve source links and existing edits.
- Ask natural questions; never expose actions, references, or unchanged state.
- Require explicit approval or caller-provided bounded authority before any write.
- Record the mismatch; never diagnose or implement its fix.
