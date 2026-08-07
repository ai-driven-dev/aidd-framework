---
name: 08-hook-generate
description: Generate a hook, a handler that runs at a lifecycle event, across the host AI tools. Use when the user wants to create, scaffold, or refactor a hook, or automate an action at a lifecycle point. Not for other artifacts like skills or rules.
argument-hint: event | action
---

# Hook Generate

Builds one hook: an entry merged into the chosen scope for each supported tool, plus the backing script.

## Actions

| #   | Action         | Role                                              | Input             |
| --- | -------------- | ------------------------------------------------- | ----------------- |
| 01  | `capture-hook` | Clarify the moment, action, matcher, scope, tools | user request      |
| 02  | `write-hook`   | Merge the entry per tool, write the script         | the captured spec |
| 03  | `validate`     | Check the file, the merge, and the moment fit      | files written     |

Run the actions in order, `01 → 03`, and run each action's `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## References

- `references/hook-authoring.md`: the contract (R1-R7), the lifecycle moments, and the handler, matcher, and exit-code model.
- `references/tool-paths.md`: per-tool support, moment-to-event names, file formats, scopes, and write targets.

## Assets

- `assets/hook-template.json`: the entry scaffold.
- `assets/hook-script-template.sh`: the backing-script scaffold.
