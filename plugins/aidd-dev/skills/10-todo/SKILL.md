---
name: 10-todo
description: Split the user prompt into independent todos and run one executor agent per todo in parallel, then report a minimal table. Use when the user says "todo" or asks to fan out a multi-part request into parallel implementations.
argument-hint: requirement
---

# Todo

Turn one prompt into N independent todos, implement them in parallel, report a table.

## Actions

```markdown
actions/01-todo.md
```

Before running an action, read its file in `actions/`, not only the table or assets.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-dev:10-todo"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
