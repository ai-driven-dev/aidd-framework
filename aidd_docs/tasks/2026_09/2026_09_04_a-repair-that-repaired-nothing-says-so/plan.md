---
status: done
---

# A repair that repaired nothing says so

## The defect

`aidd restore --force` prints `Nothing to restore — all files are unmodified.` and exits `0`
while the file it was asked to repair is still modified on disk. Three false statements in
one run: it asks for the flag it was given, it denies the drift it just detected, and it
reports success for a repair it never performed.

Reproduced on the built binary, one tracked file (`.claude/settings.json`), sandboxed `HOME`:

```
$ node dist/cli.js restore --force
Checking claude for files to restore...
Warning: [config-restore] Use --force to overwrite modified files in non-interactive mode.
Nothing to restore — all files are unmodified.
exit=0
$ cat .claude/settings.json
{"MODIFIED":true}
```

Same project, same second, the sibling command repairs it:

```
$ node dist/cli.js ai restore --force
Checking claude for files to restore...
Restored 1 file, kept 0 files
```

## The cause

Two independent faults, on the same run.

| # | Where | What |
| --- | --- | --- |
| 1 | `commands/restore.ts:19` | `--force` is read into `interactive`, then dropped. `RestoreAllUseCase.execute(projectRoot, interactive)` has no `force` parameter at all |
| 2 | `global/restore-all-use-case.ts:95` | passes `force: interactive` — so with `--force`, `interactive` is `false` and `force` is `false`. `ResolveRestoreDecisionUseCase` then throws `InputRequiredError` on the first modified file |
| 3 | `commands/restore.ts:24-29` | the throw is caught into `result.errors`, printed as a warning, and the success line is emitted anyway because `totalRestored`, `pluginNamesRestored` and `unrestorable` are all empty |

`aidd ai restore` and `aidd ide restore` both plumb `force: cmdOptions.force` into the same
use-case and are correct. Only the top-level command loses it.

Why the smoke harness never caught it: its `restore --force` case deletes a tracked file
first, and a **deleted** entry returns before the decision (`resolve-restore-decision.ts:20`,
`if (reason !== "modified") return false`). Only a *modified* file reaches the throw.

## The change

- `RestoreAllUseCase.execute` takes `force` and passes `force: force || interactive` —
  the checkbox is the consent in interactive mode, `--force` is the consent without a TTY.
  Non-interactive with neither still refuses, which is the guard working as designed.
- `restore.ts` passes `cmdOptions.force` through, and stops claiming success when the run
  produced errors: an execution error exits `1`.

No new flag, no new message, no envelope change. The surface stays what its `--help` already
promises.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| `restore --force` restores a modified tracked file | drop `force` from the `execute` signature again |
| `restore --force` never prints the "nothing to restore" line when a file was modified | restore the file but keep printing the success line unconditionally |
| `restore` without `--force` and without a TTY exits non-zero and says which flag to pass | swallow the error into a warning and exit `0` |
| interactive restore still repairs the files picked in the checkbox without a second prompt | pass `force: force` instead of `force: force \|\| interactive` |

## Proof

On the built binary, same project as the reproduction above:

```
$ node dist/cli.js restore --force
Checking claude for files to restore...
Restored 1 file(s), kept 0 file(s)          exit=0     (file back to its installed bytes)

$ node dist/cli.js restore           # modified again, no TTY, no --force
Checking claude for files to restore...
Warning: [config-restore] Use --force to overwrite modified files in non-interactive mode.
                                            exit=1     (no success line)

$ node dist/cli.js restore --force   # nothing drifted
Nothing to restore — all files are unmodified.
                                            exit=0
```

Each guard was killed by its own mutation and by no other:

| Mutation | Killed |
| --- | --- |
| `force: interactive` (the original) | the `--force` unit guard, and the e2e repair |
| `force: force` | the interactive guard only |
| drop `process.exit(1)` on errors | the loud-failure e2e only |

Gates: 3419 tests / 307 files, `tsc`, `biome ci`, knip, jscpd, bundle within budget,
368 repository script tests, 0 broken links, cli layering clean.

## Left for its own change

- The smoke case `restore --force` appends drift to a `.md` file and then asserts only
  `exit 0`, which the broken command satisfied. It belongs with the other vacuous harness
  cases, not here.
- `cost-report.ts` declares `TaskRowKey` and no longer uses it — a lint warning, unrelated
  to this command.
