# 01 - Require the CLI and check the switch

Confirm this machine can answer at all, and that the project is measuring.

## Output

A confirmed `aidd` command, or a stop with the reason.

## Process

1. **Require the CLI.** Answering reads what your AI tools wrote and turns it into a report;
   that work lives in the `aidd` command, not in a script beside this skill.

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

2. **Read the switch.** Read `telemetry.enabled` from `.aidd/config.json`.
   - Already `true`: go to collect.
   - Absent or `false`: stop, and say the project is not measuring yet.

## Test

| Case | Pass |
| --- | --- |
| `aidd` answers | the run continues to collect |
| `aidd` is absent | the run stops, names the CLI, and states that recording is unaffected |
| `aidd` is absent | no report is produced, empty or otherwise |
| The switch is off | the run stops and writes nothing |
