---
name: 01-cost
description: Answers what a period or one task consumed, broken down by step, model and tool, with how strongly each figure was attributed. Use when the user asks what a piece of work cost, where the effort went, or which step or model consumed the most. Not for turning measurement on.
argument-hint: task | period
---

# Cost

```mermaid
flowchart LR
  ask([task or period]) --> locate --> collect --> report
  locate -.->|"not measuring"| stopped([stopped])
  collect -.->|"nothing journalled"| stopped
  report --> answer([answer])
```

## Actions

Run the flow above. Read only the next action file.

| Action  | Does                                    |
| ------- | --------------------------------------- |
| locate  | find the script and check the switch    |
| collect | read what each tool's own files hold    |
| report  | ask for the figures and answer from them |

## Transversal rules

- Run only `scripts/telemetry-report.js`, beside this skill. Never a script belonging to another skill, and never the `aidd` command.
- Report what the script printed. Recomputing a figure a second way is how two figures start disagreeing.
- An absent number is not a zero. Say the figure is unknown and give what is known instead.
- Turning measurement on belongs elsewhere. Stop and say so rather than doing it here.
- The script cannot be found or fails: say so and show no figure.
