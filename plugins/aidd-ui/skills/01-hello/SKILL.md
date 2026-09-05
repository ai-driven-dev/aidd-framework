---
name: 01-hello
description: Smoke-test that confirms the aidd-ui plugin loads. Use when the user wants to verify the alpha aidd-ui plugin is installed and reachable. Not for real UI or UX design work.
---

# Skill: hello

Confirm the aidd-ui plugin loads and is reachable.

## Actions

| #   | Action  | Role                                        |
| --- | ------- | ------------------------------------------- |
| 01  | `greet` | Greet the user and confirm the skill works  |

Single action skill: run `greet` and return its message.
Before running an action, read its file in `actions/`, not only the table or assets.

## Prerequisites

- The plugin loaded locally (`claude --plugin-dir plugins/aidd-ui`, or installed from the marketplace).

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-ui:01-hello"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
