---
name: 06-agent-generate
description: Generate an agent across the host AI tools a project uses. Use when the user wants to create, scaffold, or refactor an agent, subagent or specialized role. Not for other artifacts like skills, rules, commands, hooks.
argument-hint: role
---

# Agent Generate

Write one canonical agent from intent and render it per confirmed host tool, or once as a plugin source.

## Actions

| #   | Action          | Role                                           | Input        |
| --- | --------------- | ---------------------------------------------- | ------------ |
| 01  | `capture-agent` | Gather the role, propose names, pick the model | user request |
| 02  | `write-agent`   | Render the agent per tool and write            | the role     |
| 03  | `validate`      | Check each agent file                          | the files    |

Run the actions in order, `01 → 03`, and run each action's `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## References

- `references/agent-authoring.md`: the contract (frontmatter, body shape, naming, quality).
- `references/tool-paths.md`: per-tool agent path, frontmatter, format conversions, the gate.

## Assets

- `assets/agent-template.md`: agent file scaffold.
