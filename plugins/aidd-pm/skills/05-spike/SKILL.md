---
name: 05-spike
description: Produces an evidence-bounded spike for an uncertainty blocking estimation, feasibility, or design. Use when the user wants to frame, investigate, resume, or conclude one. Not for general research or implementation.
argument-hint: question | spike
---

# Spike

```mermaid
---
title: Spike flow
---
flowchart LR
  Question([question])
  Create[create]
  Open([open])
  Spike([spike])
  Investigate[investigate]
  Conclude[conclude]

  Question --> Create
  Create -- "save for later" --> Open
  Create -- "investigate now" --> Investigate
  Spike --> Investigate
  Investigate --> Conclude
```

## Actions

Run the flow above. Read only the next action's file before running it.

| Action      | Does                                  |
| ----------- | ------------------------------------- |
| create      | qualify and persist                    |
| investigate | collect evidence                       |
| conclude    | write outcome and sync parents         |

## Transversal rules

- Require approval before spike creation or parent changes.
- Follow approved route and bounds; ask when either is absent.
- Preserve edits, evidence, and links.
- Touch only the spike and approved related artifacts.
