# 04 - Test prompt

Send one prompt to a fresh subagent, then show its response to the user.

## Input

The prompt from `@../assets/tests/prompt.md`.

## Output

The subagent's unedited response, shown to the user.

## Process

1. **Load.** Load `prompt.md`.
2. **Spawn.** Spawn one fresh subagent with the prompt.
3. **Wait.** Wait for the subagent to finish.
4. **Return.** Show its response to the user for judgment.
