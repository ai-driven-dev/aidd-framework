---
name: 11-browser-qa
description: Run post-review browser QA and produce short named videos for a locked happy path and sourced browser edge cases. Use when the user wants concise reviewer evidence for a web journey. Not for API, CLI, automated tests, diff review, or application fixes.
argument-hint: plan | artifact
---

# Browser QA

```mermaid
flowchart LR
  prerequisites["prerequisites"] --> scope["load-scope"] --> prepare["prepare-run"] --> run["run-scenarios"]
```

## Actions

Read only the next action's file before running it.

| #   | Action          | Does                                                       |
| --- | --------------- | ---------------------------------------------------------- |
| 00  | `prerequisites` | Verify the browser runner and media dependencies            |
| 01  | `load-scope`    | Lock one happy path and a bounded set of sourced edge cases |
| 02  | `prepare-run`   | Resolve the shortest deterministic path to executable runs |
| 03  | `run-scenarios` | Record, normalize, verify, reset, and report every scenario |

## Transversal rules

- Run against a reviewed change and never patch the application.
- Never spawn agents. Batch independent reads and tool checks, but keep state-changing browser work sequential.
- Do not narrate action transitions, searches, fixtures, selectors, or successful checks. Report only a blocker, a required decision, or the final verdict and paths.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-dev:11-browser-qa"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
