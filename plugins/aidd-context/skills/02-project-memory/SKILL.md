---
name: 02-project-memory
description: Build the project's memory of its architecture, conventions, and decisions, and wire it into your AI tools. Use when the user wants to set up, refresh, or check project memory, or rewire it into a tool. Not for editing one existing memory file.
argument-hint: setup or refresh | check | rewire
---

# Project Memory

```mermaid
flowchart LR
  build([no argument, setup, or refresh]) --> scan --> write --> check --> sync --> wired([memory wired])
  audit([check]) --> scan
  scan -. "check only" .-> check
  rewire([rewire]) --> sync
  scan -.-> empty([nothing to remember])
```

## Actions

Run the flow above, reading only the next action file.

| Action | Does                            |
| ------ | ------------------------------- |
| scan   | read the project                |
| write  | write the memory                |
| check  | judge it, report what drifted   |
| sync   | pick the tools, wire it in      |

## Transversal rules

- If a referenced file cannot be read, stop and say so. Never invent its content.
- Ask before anything ambiguous. Never default silently.
- Create or revise a file, keeping every line the user wrote. Drop such a line, or a whole file, only when the user asks.
- End with a short report of what changed.
