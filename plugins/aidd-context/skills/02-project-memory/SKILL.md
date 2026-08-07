---
name: 02-project-memory
description: Build the project's memory of its architecture, conventions, and decisions, and wire it into the tools you use. Use to set up or refresh project memory. Not for editing one existing memory file.
argument-hint: setup | refresh | rewire | test-prompt
---

# Project Memory

```mermaid
flowchart LR
  build([setup or refresh]) --> scan --> generate --> sync
  rewire([rewire only]) --> sync
  test_prompt([test prompt])
```

## Actions

Run the flow above. No argument, `setup`, or `refresh` starts at scan. `rewire` runs sync alone. `test-prompt` runs alone. Read an action's file in `actions/` before running it.

| Action      | Does                                      |
| ----------- | ----------------------------------------- |
| scan        | read the project                          |
| generate    | write the memory                          |
| sync        | pick the tools, wire it in                |
| test-prompt | send one prompt for user judgment         |

## Transversal rules

- If a referenced file cannot be read, stop and say so. Never invent its content.
- Ask before anything ambiguous. Never default silently.
- Create or revise a file, keeping the user's edits. Delete one only when the user asks.
- After an action changes files, end with a short report of what changed.
