# 02 - Run it, and present every line it printed

Ask the script whether the chain is recording, and hand back exactly what it found.

## Input

The path to `telemetry-check.js`, from locate.

## Output

Every line the script printed, unchanged, or the one line it prints when measurement is off.

## Process

1. **Run it.** `node <telemetry-check.js>` takes no arguments and reads the current project.
2. **Measurement off stops here.** If the only line says measurement is off, relay that line and stop — there is nothing to check until it is turned on, and no failure to report.
3. **Not a git repository stops here too.** If the only line says so, relay it and stop. The hook writes into the repository's own tree; outside one it has nowhere to write, which is a fact about the project, not a hook that failed to fire — never relay it as "hook fired FAIL".
4. **Present every line, in the order printed.** Four claims, then any tool nothing here can read. Add nothing that sums them: a line summarising the others is where a failure hides.
5. **Read `FAIL` on "hook fired" as one of two distinct claims, never as a broken install.** No run file anywhere reads as never having been observed firing. A run file that exists but is not this session's own reads as this session leaving no run file, naming how stale the newest one is — a hook that died since the last one, not a hook that never worked.
6. **Read `--` as nothing to evaluate, never as passing.** It means an earlier claim already explains why this one has no material to check, and that earlier line is where the reason lives.
7. **A tool marked not covered is never counted toward health.** Its line carries its own reason, read from the same place the cost skill reads it, and stays separate from the four claims.

## Test

| Case | Pass |
| --- | --- |
| Measurement is off | that single line is relayed and the run stops before checking anything |
| Not a git repository | that single line is relayed and the run stops before checking anything, and it is never read as "hook fired FAIL" |
| A healthy install | all four claims read `ok`, each carrying what it was read from |
| A hook never fired | the line reads never observed firing, not broken or missing |
| A run file exists but predates this session | the line reads this session left no run file, distinct from never having fired |
| Only `session_start` was written | that claim alone reads `FAIL`; the claims after it read `--` or `ok`, never `FAIL` for the same reason |
| A tool is not covered | its line names the tool and its reason, and is not read as a fifth failing claim |
