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

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-context:07-command-generate"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
