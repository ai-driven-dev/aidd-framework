---
status: done
---

# The Windows e2e step stops starving its own reporter

## The defect

`cli / Windows` fails with every test passing:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 Test Files  39 passed (39)
      Tests  279 passed (279)
     Errors  1 error
##[error]Process completed with exit code 1.
```

A red check that names no failing test is worse than a red check: it teaches everyone
reading it that red means nothing.

## Measured, not guessed

| Run | Commit | Where |
| --- | --- | --- |
| 33607484822 | 2026-09-02 | `cli e2e` |
| 33914045451 | merge to `next` | `cli e2e` |
| 33915646619 | merge to `next` | `cli e2e` |
| 33920326168 | merge to `next` | `cli e2e` |
| 33920873620 | a pull request, **and its re-run of the same commit** | `cli e2e` |

Every one of them: all tests green, exit 1. The re-run rules out a one-off, and three plain
merges to `next` rule out any one branch. Two other Windows failures in the same window are
a different, real fault (`a comment that names a source file names one that exists`), fixed
where it belonged.

## The cause

Vitest transforms modules on its own main thread while every worker calls back into it —
`onTaskUpdate` after each test — and that call has a fixed 60 s timeout:
`DEFAULT_TIMEOUT = 6e4` in the bundled `birpc`, exposed by no configuration key. On this
runner — 4 vCPU, a slow filesystem, Defender scanning every spawned executable, and an e2e
test that spawns `node dist/cli.js` inside every worker — the default pool of one fork per
CPU-but-one queued that main thread past 60 s. The suite has grown all week, which is why a
single occurrence on 2026-09-02 became four in one evening.

## The change

`--max-workers=2` on that one step. Halving the pool halves the transform requests competing
for the thread that must answer them. The Linux jobs keep the default: they have never
produced this, and slowing them down would buy nothing.

## The workflow never ran on its own changes

Found while opening this: `cli CI` filters on `cli/**`, `kanban/**`,
`plugins/aidd-telemetry/**` and `scripts/__tests__/**`, and nothing else. A commit touching
only `.github/workflows/cli-ci.yml` matched no filter, so the first push of this very fix
ran three workflows and not the one it changes - and merging it would have run nothing
either, since `push` filters the same way. A change to how the suite runs would have landed
unverified, which is how the pool size gets a comment claiming an effect nobody watched.

The workflow now lists itself. It is the one path whose change alters every job in the file.

## What would prove it wrong

Nothing local can: the failure needs this runner. The proof is the runs themselves — if the
message returns on Windows with the smaller pool, the next step is sharding that step in
two, not a larger `--max-workers`. Stated here so the next person does not have to
re-derive it from an empty log.
