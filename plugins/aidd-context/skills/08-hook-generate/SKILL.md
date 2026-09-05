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

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-context:08-hook-generate"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
