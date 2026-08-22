# 01 - Locate the script

Find this skill's script.

## Output

The path to `telemetry-check.js`.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-check.js`.

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/02-check/scripts/telemetry-check.js" \
     || find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
        -type f -path '*02-check/scripts/telemetry-check.js' 2>/dev/null | head -1
   ```

2. **Hand off.** The script decides on its own whether measurement is on; nothing here needs to check the switch first.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The path is read back | it names this skill's own directory, never another skill's |
| The plugin is absent | the run stops and writes nothing |
