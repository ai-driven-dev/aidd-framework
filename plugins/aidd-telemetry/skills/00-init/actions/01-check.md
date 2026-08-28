# 01 - Check what is already set up

Confirm this machine can turn measurement on at all, and read whether the project already
does.

## Output

A confirmed `aidd` command, and whether the switch is already on.

## Process

1. **Require the CLI.** Turning measurement on writes the one switch every component reads;
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
   - Already `true`: no consent to ask again, but run `aidd telemetry on --yes` once more
     anyway — idempotent on the switch itself, and it is what catches a project turned on
     before this check existed up on ignoring the journal and naming any of it git already
     tracks. The `--yes` here confirms nothing new: this project already made this exact
     choice, and re-running only catches it up. Relay what it prints, then go to verify.
   - Absent or `false`: go to enable.

## Test

| Case | Pass |
| --- | --- |
| `aidd` answers | the run continues to enable or verify |
| `aidd` is absent | the run stops, names the CLI, and states that recording is unaffected |
| `aidd` is absent | no switch is written, and nothing is asked |
| The switch is already on | the run goes to verify without asking again, but still catches the journal up on `.gitignore` and names anything already tracked |
