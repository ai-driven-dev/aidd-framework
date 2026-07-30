---
name: 09-defect
description: Produces or refines a backlog Defect from an observed product mismatch. Use when the user wants to report, assess, link, order, transition, or verify a defect. Not for incident response, debugging, or implementation.
argument-hint: report | defect
---

# Defect

```mermaid
flowchart LR
  source([report or Defect]) --> capture --> assess --> finalize
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

- Keep product, priority, and lifecycle decisions with the user.
- Separate observation, evidence, and inference.
- Record the defect; never diagnose or implement its fix.
- Preserve source evidence and existing edits.
- Require explicit approval or caller-provided bounded authority before any write or related-item change.
- For Markdown, run [the backlog checker](../../hooks/check-backlog.js) before writing and after; stop on existing findings, then correct this skill's findings.
