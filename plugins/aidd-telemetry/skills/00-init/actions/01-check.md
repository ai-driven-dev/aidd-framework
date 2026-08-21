# 01 - Check what is already set up

Locate this skill's script and read whether the project already allows measuring.

## Output

The path to `telemetry-switch.js`, and whether the switch is already on.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-switch.js`.

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/00-init/scripts/telemetry-switch.js" \
     || find . ~/.claude -type f -path '*00-init/scripts/telemetry-switch.js' 2>/dev/null | head -1
   ```

2. **Check node.** Run `node --version`. The script needs it and nothing else, no package manager and no global install.
   - Node is missing: stop, and say the host has no runtime for the plugin's scripts.
3. **Read the switch.** Read `telemetry.enabled` from `.aidd/config.json`.
   - Already `true`: go to verify, there is nothing to turn on.
   - Absent or `false`: go to enable.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The plugin is absent | the run stops and writes nothing |
| The switch is already on | the run goes straight to verify |
