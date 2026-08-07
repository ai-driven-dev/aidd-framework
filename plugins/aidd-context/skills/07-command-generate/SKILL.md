---
name: 07-command-generate
description: Generate a flat slash command across the host AI tools a project uses. Use when the user wants to create, scaffold, or refactor a one-shot slash command. Not for multi-step skills or other artifacts like rules, agents, hooks.
argument-hint: goal
---

# Command Generate

Write one canonical slash command from intent and render it per confirmed host tool that supports commands, or once as a plugin source.

## Actions

| #   | Action            | Role                                      | Input        |
| --- | ----------------- | ----------------------------------------- | ------------ |
| 01  | `capture-command` | Capture the goal, location, and arguments | user request |
| 02  | `write-command`   | Write the command file per supported tool | the goal     |
| 03  | `validate`        | Check each command file                   | the files    |

Run the actions in order, `01 → 03`, and run each action's `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## References

- `references/command-authoring.md`: the contract (forms, placement, frontmatter, arguments, conventions).
- `references/tool-paths.md`: per-tool command path, frontmatter, unsupported tools, the gate.

## Assets

- `assets/command-template.md`: command file scaffold.
