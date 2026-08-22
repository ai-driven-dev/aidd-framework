# 01 - Check what is already set up

Locate this skill's script and read whether the project already allows measuring.

## Output

The path to `telemetry-switch.js`, and whether the switch is already on.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-switch.js`. Run
   whichever of these two matches the shell your commands actually run in - on Windows that
   is plain PowerShell unless it is Git Bash. `find` is GNU `find` under Git Bash but is
   Windows' own unrelated `find.exe` under PowerShell, so the bash form silently finds
   nothing there (#707).

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/00-init/scripts/telemetry-switch.js" \
     || find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
        -type f -path '*00-init/scripts/telemetry-switch.js' 2>/dev/null | head -1
   ```

   ```powershell
   if ($env:CLAUDE_PLUGIN_ROOT -and (Test-Path "$env:CLAUDE_PLUGIN_ROOT/skills/00-init/scripts/telemetry-switch.js")) {
     "$env:CLAUDE_PLUGIN_ROOT/skills/00-init/scripts/telemetry-switch.js"
   } else {
     Get-ChildItem -Path "$HOME/.claude/plugins", "$HOME/.codex/plugins", "$HOME/.cursor/plugins", ".github/plugins", ".claude/plugins", ".codex/plugins", "." -Recurse -File -Filter "telemetry-switch.js" -ErrorAction SilentlyContinue |
       Where-Object { $_.FullName -replace '\\', '/' -match '00-init/scripts/telemetry-switch.js$' } |
       Select-Object -First 1 -ExpandProperty FullName
   }
   ```

   No output from either form means the script cannot be found.

2. **Check node.** Run `node --version`. The script needs it and nothing else, no package manager and no global install.
   - Node is missing: stop, and say the host has no runtime for the plugin's scripts.
3. **Read the switch.** Read `telemetry.enabled` from `.aidd/config.json`.
   - Already `true`: no consent to ask again, but run `node <telemetry-switch.js> on` once more anyway — idempotent on the switch itself, and it is what catches a project turned on before this check existed up on ignoring the journal and naming any of it git already tracks. Relay what it prints, then go to verify.
   - Absent or `false`: go to enable.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The plugin is absent | the run stops and writes nothing |
| The switch is already on | the run goes to verify without asking again, but still catches the journal up on `.gitignore` and names anything already tracked |
