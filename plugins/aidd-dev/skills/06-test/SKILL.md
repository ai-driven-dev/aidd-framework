---
name: 06-test
description: Write and iterate tests until they pass, or validate a user journey end to end in the browser. Use when the user wants to add coverage, find what's untested, or walk a flow. Not for auditing test health or debugging a failure.
argument-hint: scope | journey
model: sonnet
---

# Skill: test

Find untested behavior and iterate tests until they pass, or drive a full user journey through the browser and check each step.

## Actions

| #   | Action         | When to use                                                     |
| --- | -------------- | -------------------------------------------------------------- |
| 01  | `test`         | Find untested behaviors and write or iterate tests until they pass |
| 02  | `test-journey` | Validate a full user journey end-to-end in the browser         |

Pick the one action matching the intent; never default to `01`. Triggers like "write tests" or "what's untested" route to `01`, "test the user journey" or "end-to-end" to `02`. Ask one question when the intent is ambiguous.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- One action per run: follow only the matching action file.
- Functional behavior only: never couple a test to implementation details.
- Never compromise quality for speed.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-dev:06-test"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
