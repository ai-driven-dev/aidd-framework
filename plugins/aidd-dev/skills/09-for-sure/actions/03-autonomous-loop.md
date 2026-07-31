# 03 - Autonomous loop

Orchestrate the loop: for each unchecked step spawn a worker, verify the result, then check the box or retry. One step is one agent is one log entry, and the orchestrator never does the work itself.

## Input

The tracking file `aidd_docs/tasks/<task-name>.md` produced by `01-init-tracking`. The loop runs with no human interaction, reading and writing through that file.

## Output

The success condition verified and the plan's `status` set to `implemented`, with every step checked and one Log entry per attempt.

## Process

1. **Read.** Read the entire file: frontmatter, journey map, steps, and full Log.
2. **Mark.** Increment `iteration` in the frontmatter, setting `status: in-progress` when still `pending`.
3. **Learn.** Read the Log to learn from prior attempts.
4. **Next.** Find the next unchecked step.
5. **Spawn.** Spawn a worker for that step with [autonomous-loop-worker-prompt.md](../assets/autonomous-loop-worker-prompt.md), passing the step description and the relevant context (objective, rules, prior Log entries for the step).
6. **Verify.** Read the worker's result, then verify concretely by running a check command, reading a file, or testing the output. Never trust the worker's claim alone.
7. **Record.** Read the worker's outcome. When it stopped at a money or destructive gate, surface the reason to the user and stop the loop; never retry, which would re-trigger the action. On verified success, tick the step `[x]`. On a plain failure, spawn another worker with the error context. Append a Log entry per [autonomous-loop-log-format.md](../references/autonomous-loop-log-format.md).
8. **Loop.** Move to the next unchecked step and repeat from Read.
9. **Evaluate.** Once every step is checked, run the `success_condition` command and verify the result yourself. On success, set `status: implemented` and stop. On failure, add new steps addressing the root cause and continue the loop.

## Test

- Each step attempt has exactly one Log entry.
- Every checked step has a `= ✓` entry whose verification cites a concrete command or file.
- `status: implemented` is set only after the `success_condition` command has been re-run and exits zero.
