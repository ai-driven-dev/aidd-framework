# 01 - Init tracking

Validate prerequisites, build a journey map, create the tracking file, and hand off to the autonomous loop. The last interactive step before the loop runs unattended.

## Input

The task name (required), an optional free-form description, a runnable success condition that exits 0 on success (required), and optional rules.

## Output

The tracking file at `aidd_docs/tasks/<task-name>.md`, marked created or resumed, with any pre-flight blocker halting before the spawn.

## Process

1. **Resume.** Check `aidd_docs/tasks/` for a file matching the task name and read its frontmatter `status`.
   - `pending` or `in-progress`: report the status (iteration, steps remaining), then skip to Spawn to resume.
   - `implemented`: report "Task already completed" and stop.
   - No file: continue to Collect.
2. **Collect.** Gather the task name, description, success condition, and rules from the user.
3. **Research.** Before planning steps, read the relevant documentation (README, official guides) and identify the recommended method. Do not default to what you already know.
4. **Goal.** Ask "could I execute this with zero ambiguity?" When no, ask the user to reformulate. "Make the code better" is rejected ("what metric?"); "all tests pass after `npm test`" is accepted.
5. **Condition.** It must be a runnable command. `npm test exits 0` is valid; "the code is clean" is invalid and is pushed back to `eslint . exits 0`.
6. **Pre-flight.** For each step, list tools, secrets, API access, data, and permissions. Mark `[✓]` already satisfied, `[~]` soft (the agent self-serves), `[!]` hard (only the user can provide it). Collect every `[!]` now; when any stays unresolved, stop before the next step.
7. **Map.** Project the whole path as an ASCII map of steps, dependencies, tools, and blockers. Ask the user to confirm and iterate until they do.
8. **Scaffold.** Load [plan-template.md](../assets/plan-template.md), creating `aidd_docs/tasks/` when missing.
9. **Create.** Write `aidd_docs/tasks/<task-name>.md` from the template. Fill the frontmatter (`objective`, `success_condition`, `iteration: 0`, `status: pending`), the phases with their tasks and acceptance criteria, and the journey map.
10. **Spawn.** Read the orchestrator recipe from [03-autonomous-loop.md](./03-autonomous-loop.md) and hand it to the Agent tool with `<task-name>` filled in.

## Test

- The tracking file exists with frontmatter `status: pending` at creation.
- Its `success_condition` is a runnable command and the journey map is present.
- Every `[!]` blocker was resolved before the spawn, and an autonomous agent was launched.
