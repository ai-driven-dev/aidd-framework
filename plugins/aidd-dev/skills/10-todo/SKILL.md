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
