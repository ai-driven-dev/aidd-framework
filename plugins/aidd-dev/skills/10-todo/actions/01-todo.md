# 01 - Todo

Categorize the user prompt into independent todos, implement each in parallel, report.

## Input
User's requirement.

## Output
```markdown
| Category | Launched | Output |
| -------- | -------- | ------ |
```

## Process

1. **Read.** Take `prompt` from the arguments; if empty, ask the user.
2. **Categorize.** Split the prompt into distinct, independent todos (category + task). Inline, no agent.
3. **Launch.** Spawn one `executor` agent per todo, all in parallel (one message, multiple Task calls). Each agent prompt mandates, in order:
   ```markdown
   1. Refine the todo first: run a non-interactive refine capability if one is available (discovered at runtime, never a hardcoded plugin name); otherwise restate the todo clearly and resolve obvious ambiguity inline. Never block on the user.
   2. Implement the refined todo.
   3. Return a one-line output summary.
   ```
4. **Report.** Print exactly one table, nothing else.

## Test

- Every todo is one row in the table.
- Agents were spawned in a single parallel batch.
- Each agent ran a refine step before implementing.
- No output besides the table.
