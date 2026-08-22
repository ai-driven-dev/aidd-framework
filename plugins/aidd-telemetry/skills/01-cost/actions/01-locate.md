# 01 - Locate the script and check the switch

Find this skill's script, and check the project is measuring at all.

## Output

The path to `telemetry-report.js`, or a stop with the reason.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-report.js`.

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/01-cost/scripts/telemetry-report.js" \
     || find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
        -type f -path '*01-cost/scripts/telemetry-report.js' 2>/dev/null | head -1
   ```

2. **Read the switch.** Read `telemetry.enabled` from `.aidd/config.json`.
   - Already `true`: go to collect.
   - Absent or `false`: stop, and say the project is not measuring yet.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The path is read back | it names this skill's own directory, never another skill's |
| The switch is off | the run stops and writes nothing |
