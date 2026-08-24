# 01 - Locate the script

Find this skill's script.

## Output

The path to `telemetry-check.cjs`.

## Process

1. **Resolve the script.** It sits beside this skill, under `scripts/telemetry-check.cjs`. Run
   whichever of these two matches the shell your commands actually run in - on Windows that
   is plain PowerShell unless it is Git Bash. `find` is GNU `find` under Git Bash but is
   Windows' own unrelated `find.exe` under PowerShell, so the bash form silently finds
   nothing there (#707). The trailing `|| true` is not decoration: `find` exits non-zero for
   every directory in the list that does not exist, and on a fresh machine most of them do
   not - without it the line prints the right path and still reports failure to any shell
   that stops on one (#707).

   ```bash
   test -n "$CLAUDE_PLUGIN_ROOT" && ls "$CLAUDE_PLUGIN_ROOT/skills/02-check/scripts/telemetry-check.cjs" \
     || find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
        -type f -path '*02-check/scripts/telemetry-check.cjs' 2>/dev/null | head -1 || true
   ```

   ```powershell
   if ($env:CLAUDE_PLUGIN_ROOT -and (Test-Path "$env:CLAUDE_PLUGIN_ROOT/skills/02-check/scripts/telemetry-check.cjs")) {
     "$env:CLAUDE_PLUGIN_ROOT/skills/02-check/scripts/telemetry-check.cjs"
   } else {
     Get-ChildItem -Path "$HOME/.claude/plugins", "$HOME/.codex/plugins", "$HOME/.cursor/plugins", ".github/plugins", ".claude/plugins", ".codex/plugins", "." -Recurse -File -Filter "telemetry-check.cjs" -ErrorAction SilentlyContinue |
       Where-Object { $_.FullName -replace '\\', '/' -match '02-check/scripts/telemetry-check.cjs$' } |
       Select-Object -First 1 -ExpandProperty FullName
   }
   ```

   No output from either form means the script cannot be found.

2. **Hand off.** The script decides on its own whether measurement is on; nothing here needs to check the switch first.

## Test

| Case | Pass |
| --- | --- |
| The plugin is installed | the script's path resolves with nothing else installed |
| The path is read back | it names this skill's own directory, never another skill's |
| The plugin is absent | the run stops and writes nothing |
