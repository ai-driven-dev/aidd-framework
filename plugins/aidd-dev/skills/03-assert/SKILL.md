---
name: 03-assert
description: Assert the work behaves by iterating the project's coding assertions until they pass, plus optional architecture and frontend facets. Use to validate an implementation. Not for reviewing or writing tests.
argument-hint: work | scope
model: sonnet
---

# Skill: assert

Validate that the work behaves as intended: run the project's assertions, iterating and fixing until they pass.

## Actions

| #   | Action                | Facet                                                       |
| --- | --------------------- | ----------------------------------------------------------- |
| 01  | `assert`              | Run the project's coding assertions, fixing until they pass |
| 02  | `assert-architecture` | Report where the code breaks the documented architecture    |
| 03  | `assert-frontend`     | Inspect the running UI, fixing until the behavior is right   |

Run every applicable facet by default, or one when named. Coding (`01`) always applies; add `03` when the work has a UI and a frontend is running, the facet resolving the URL itself; run `02` only when architecture conformance is asked for. Skip a facet whose precondition is absent, with a noted reason. Ask only when the intent is genuinely ambiguous.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Gate: it returns a pass or fail verdict on the work.
- Fix loop: the coding and frontend facets fix and re-run until they pass. The architecture facet only reports, never fixes.
- Stop only when every selected assertion passes a final clean sweep.

## Assets

- `assets/task-template.md`: the tracking file the frontend facet fills across its fix loop.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-dev:03-assert"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
