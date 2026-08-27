# 01 - Confirm the CLI

Confirm this machine can answer at all.

## Output

A confirmed `aidd` command, or a stated reason it cannot answer.

## Process

1. **Require the CLI.** Answering every claim below — the export route as much as the
   local one — lives in the `aidd` command, not in a script beside this skill.

   ```bash
   aidd --version
   ```

   No output, or a command that is not found, means this machine cannot answer. **Stop, and
   say two things:**
   - the `aidd` command is required to answer, and can be installed with
     `npm install -g @ai-driven-dev/cli`;
   - **recording is unaffected** - the hooks that write the journal are plain node and need
     nothing installed, so no measurement is being lost while the CLI is missing.

   Never continue to a report. A missing command is not a measurement of zero, the same way
   a tool that writes no token count is not a tool that cost nothing.

2. **Hand off.** `aidd telemetry check` decides on its own whether measurement is on;
   nothing here needs to check the switch first.

## Test

| Case | Pass |
| --- | --- |
| `aidd` answers | the run continues to diagnose |
| `aidd` is absent | the run stops, names the CLI, and states that recording is unaffected |
| `aidd` is absent | nothing is run and nothing is reported |
