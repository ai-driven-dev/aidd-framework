---
objective: "Windows passes because the code handles it, not because the tests stopped asking."
status: done
---

# Plan: Windows, taken as one problem

## Overview

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| **Goal**   | Four causes closed, not twenty symptoms patched             |
| **Source** | [`spec.md`](./spec.md), issue #707                          |

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | A private journal git can still stage        | [`phase-1.md`](./phase-1.md) |
| 2   | A path is compared one way, in one place     | [`phase-2.md`](./phase-2.md) |
| 3   | A line ends either way                       | [`phase-3.md`](./phase-3.md) |
| 4   | A person's file is where Windows keeps it    | [`phase-4.md`](./phase-4.md) |
| 5   | A reader finds the file on either platform   | [`phase-5.md`](./phase-5.md) |
| 6   | An assertion names a location, not a spelling | [`phase-6.md`](./phase-6.md) |

Phases 5 and 6 were not in the first reading of the failure set: with A-D closed, the Windows job went from 8 failing integration files to none and from 22 e2e failures to 7, and what was left underneath was two more causes, one of them the only one that changes an answer rather than a test.

One dispatch per phase, in order. The reactive rounds that preceded this plan each read a report and fixed what it named; the point of the order is that phase 2 is the large one and the rest are easier to judge once it is gone.

## Resources

| Source | Verified |
| --- | --- |
| CI run `32606043625`, the Windows probe's own failing assertions | Read in full, not summarised: `expected 'D:\…'`, `expected [ '/test-project/.gitignore' ] to include …`, `{ allowed_tools: [] }` where a parsed document was expected, and eleven identity tests naming a POSIX path. |
| The five reactive rounds before it | Counts moved 366 → 394 → 419 on the plugin suite and 50 → 16 → 14 on integration. Real progress, and a tail that kept growing because nobody looked at the set. |
| `plugins/aidd-telemetry/hooks/lib/repo.js` | The `icacls` reset that made the journal private, and the collision it introduced with git's own handling of a tracked `.gitkeep`. |
| The measured `%APPDATA%` move | The sink and its CLI mirror already resolve it. The identity feature, written after, does not. |

## Outcome

`cli / Windows Probe (#707)` is green, and green because it passes: `every probe step passed`,
with the plugin suite at 482 and 0 failing, unit 177/177, integration 59/59, e2e 22/22 on a
real `windows-latest` runner.

One test is skipped there, and says why in its own name: `SessionStart creates the run
directory 0700 and the record file 0600 on POSIX # SKIP POSIX mode bits do not apply on
win32`. Windows privacy is not left unasserted because of it - the probe reads the ACL back
with `icacls` and finds the current user alone on both the directory and the journal file,
and `git add -A` succeeds in the same checkout.

Two causes were not in the first reading of the failure set. A fifth, the only one that
changed an answer rather than a test: `os.homedir()` never reads `$HOME` on Windows, so a
home a person or a test set was honoured by the plugin and ignored by the CLI. A sixth, the
last two red steps, were not tests at all - they were the probes that *measured* #707's own
question, and they had answered it.

## Decisions

| Decision | Why |
| --- | --- |
| Privacy is not traded away to make git work | A fix that loosens the ACL would turn every test green and leave the journal readable by any account on the machine. That is the failure we just closed, reopened by its own repair. |
| Paths are compared through one place, never normalised at each site | Sprinkling a normalisation until the tests go quiet leaves the mistake available to make again on the twenty-first comparison. One place can be pointed at; a habit cannot. |
| No test is excluded to reach green | Each failure is either a real difference the code should handle or a test written as though one platform existed. Both are fixable, and neither is a reason to stop asking. |
| A green Windows job must mean passing, not narrowed | The job's whole value is that it was red for true reasons. A job that goes green by asking less would be worse than the red one it replaced. |
