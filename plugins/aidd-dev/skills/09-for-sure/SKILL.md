---
name: 09-for-sure
description: Run an iterative agent loop that retries until a runnable success condition passes. Use when the user says "for sure", "keep trying until", or wants guaranteed completion against a success command. Not for one-shot tasks or uncheckable goals.
argument-hint: task | command
---

# Skill: for-sure

Run an autonomous loop until a success condition is verified. An interactive pre-flight (human present) sets it up, then autonomous execution (human gone) retries until success, acting as the user and never stopping early.

## Actions

| #   | Action            | Phase                  | Role                                                                       |
| --- | ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| 01  | `init-tracking`   | interactive pre-flight | validate the goal, build the journey map, create the tracking file, spawn the loop |
| 02  | `auto-accept`     | autonomous             | decide and act as the user, stopping only on money or destructive actions  |
| 03  | `autonomous-loop` | autonomous             | spawn one worker per step, verify, retry, evaluate the success condition   |

Run `01` interactively; it spawns `03`, which runs unattended under the `02` auto-accept rules until the success condition passes.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Single source of truth: all task state lives in `aidd_docs/tasks/<task-name>.md` and nowhere else.
- No repeated failures: never retry a failed approach without a meaningful change.
- Honesty over escape: never set `status: implemented` until the success condition genuinely passes.
- Auto-accept: when a decision or approval is needed, act as the user (create accounts, generate keys, approve prompts, install tools), never asking. Stop only on a payment or a destructive action.
- The loop spawns one worker agent per step and never does the work itself.

## Assets

- `assets/plan-template.md`: the tracking file format (frontmatter, phases, acceptance criteria, Log).
- `assets/autonomous-loop-worker-prompt.md`: the prompt the loop spawns each per-step worker with.

## References

- `references/autonomous-loop-log-format.md`: the Log entry format the loop appends per attempt.
