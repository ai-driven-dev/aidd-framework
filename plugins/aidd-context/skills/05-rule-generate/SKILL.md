---
name: 05-rule-generate
description: Generate a coding rule that governs editor and agent behavior across the host AI tools. Use when the user wants to write, add, or refactor a rule, convention, or coding standard. Not for other artifacts like skills, agents, or hooks.
argument-hint: topic | auto
---

# Rule Generate

Write one canonical rule from intent and render it per confirmed host tool that supports rules, or once as a plugin source.

## Actions

| #   | Action         | Role                                      | Input        |
| --- | -------------- | ----------------------------------------- | ------------ |
| 01  | `capture-rule` | Capture the topic, pick category and slug | user request |
| 02  | `write-rule`   | Write the rule file per supported tool    | the topic    |
| 03  | `validate`     | Check each rule file                      | the files    |

Run the actions in order, `01 → 03`, and run each action's `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## References

- `references/rule-authoring.md`: the contract (taxonomy, naming, frontmatter, content).
- `references/tool-paths.md`: per-tool rules path, frontmatter, unsupported tools, the gate.

## Assets

- `assets/rule-template.md`: rule file scaffold.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-context:05-rule-generate"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
