---
name: 00-init
description: Turns AIDD measurement on for a project and proves it is recording. Use when the user wants to start measuring what their work costs, wants to stop, or asks why nothing is being recorded. Not for answering what a piece of work consumed.
argument-hint: project
---

# Init

```mermaid
flowchart LR
  ask([project]) --> check --> enable --> verify
  check -.->|"already on"| verify
  verify --> recording([recording])
```

## Actions

Run the flow above. Read only the next action file.

| Action | Does                                        |
| ------ | ------------------------------------------- |
| check  | find the script and read the current switch |
| enable | ask, then turn measurement on               |
| verify | prove a session is actually being recorded  |

## Transversal rules

- Measuring someone's project is theirs to allow. Ask before turning it on, always.
- Run only `scripts/telemetry-switch.js`, beside this skill. Never a script belonging to another skill, and never the `aidd` command.
- The script cannot be found: say so and change nothing.
