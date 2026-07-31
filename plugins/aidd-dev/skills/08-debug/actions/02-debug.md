# 02 - Debug

Find the root cause of an issue by enumerating hypotheses, validating each, and arriving at a cause the user signs off on.

## Input

The issue, a free-form description of the symptom or error.

## Output

A one-line root cause, the 3 to 5 hypotheses with their confidence and validated or invalidated status plus evidence, an action-path flowchart, and the next steps.

## Process

1. **Summarize.** Restate the issue in your own words.
2. **Map.** Draw the action paths as a Mermaid flowchart (a click calls a function in one file that updates state in another), per [mermaid-conventions.md](../references/mermaid-conventions.md).
3. **Whys.** Start from the symptom and ask "why" iteratively, three to five levels, each documented in a numbered list.
4. **Tools.** Identify the inspection tools available (MCP, CLI commands, logs, traces).
5. **Locate.** Find the relevant files in the codebase for the issue.
6. **Causes.** List 3 to 5 potential causes in a table: analysis, evidence, confidence (1 to 10).
7. **Track.** Record one task per hypothesis in the project task system, filling [task-template.md](../assets/task-template.md).
8. **Validate.** Work the hypotheses one by one, ticking each as validated or invalidated with evidence in the task. Stop when the root cause is found.
9. **Conclude.** State the conclusion and next steps.
10. **Confirm.** Wait for user validation before moving on.
11. **Fallback.** When every hypothesis is invalidated, hand off to the `reflect-issue` action for fresh sources.

## Test

- The hypotheses list has 3 to 5 entries, each with a validated or invalidated status.
- A validated hypothesis has non-empty evidence and a one-line root cause consistent with it.
- The output includes a Mermaid action-path flowchart and a confidence score per hypothesis.
- When every hypothesis is invalidated, the next steps cite the `reflect-issue` action.
