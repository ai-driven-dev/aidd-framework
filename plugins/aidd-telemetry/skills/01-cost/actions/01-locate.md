# 01 - Locate the script and check the switch

Find this skill's script, and check the project is measuring at all.

## Output

The path to `telemetry-report.js`, or a stop with the reason.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-report.js`. Run
   whichever of these two matches the shell your commands actually run in - on Windows that
   is plain PowerShell unless it is Git Bash. `find` is GNU `find` under Git Bash but is
   Windows' own unrelated `find.exe` under PowerShell, so the bash form silently finds
   nothing there (#707). The trailing `|| true` is not decoration: `find` exits non-zero for
   every directory in the list that does not exist, and on a fresh machine most of them do
   not - without it the line prints the right path and still reports failure to any shell
   that stops on one (#707).

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/01-cost/scripts/telemetry-report.js" \
     || find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
        -type f -path '*01-cost/scripts/telemetry-report.js' 2>/dev/null | head -1 || true
   ```

   ```powershell
   if ($env:CLAUDE_PLUGIN_ROOT -and (Test-Path "$env:CLAUDE_PLUGIN_ROOT/skills/01-cost/scripts/telemetry-report.js")) {
     "$env:CLAUDE_PLUGIN_ROOT/skills/01-cost/scripts/telemetry-report.js"
   } else {
     Get-ChildItem -Path "$HOME/.claude/plugins", "$HOME/.codex/plugins", "$HOME/.cursor/plugins", ".github/plugins", ".claude/plugins", ".codex/plugins", "." -Recurse -File -Filter "telemetry-report.js" -ErrorAction SilentlyContinue |
       Where-Object { $_.FullName -replace '\\', '/' -match '01-cost/scripts/telemetry-report.js$' } |
       Select-Object -First 1 -ExpandProperty FullName
   }
   ```

   No output from either form means the script cannot be found - go to the case below that says so.

2. **Read the switch.** Read `telemetry.enabled` from `.aidd/config.json`.
   - Already `true`: go to collect.
   - Absent or `false`: stop, and say the project is not measuring yet.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The path is read back | it names this skill's own directory, never another skill's |
| The switch is off | the run stops and writes nothing |
