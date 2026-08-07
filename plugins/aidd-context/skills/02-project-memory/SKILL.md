---
name: 02-project-memory
description: Build the project's memory of its architecture, conventions, and decisions, and wire it into the tools you use. Use when the user wants to set up or refresh project memory. Not for editing one existing memory file.
argument-hint: setup | refresh | rewire
---

# Project Memory

```mermaid
flowchart LR
  build([no argument, setup, or refresh]) --> scan --> generate --> sync
  rewire([rewire]) --> sync
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                       |
| -------- | -------------------------- |
| scan     | read the project           |
| generate | write the memory           |
| sync     | pick the tools, wire it in |

## Transversal rules

- If a referenced file cannot be read, stop and say so. Never invent its content.
- Ask before anything ambiguous. Never default silently.
- Create or revise a file, keeping the user's edits. Delete one only when the user asks.
- End with a short report of what changed.
