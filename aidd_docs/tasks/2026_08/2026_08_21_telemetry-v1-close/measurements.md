---
status: done
---

# Measurements: a period that has met a hundred sessions, and a cap that has met a real tree

Everything this milestone shipped had been run against at most three sessions and a task
tree of a handful of files before this. Two numbers were guesses: whether a period holding
real volume answers at all, and the 2000-entry cap on the turn-end task-tree walk. Both are
measured below, on this machine, on 2026-08-22.

## The premise about this repository's own tree does not hold

The instruction to time the walk assumed "this repository's real `aidd_docs/` tree ...
has hundreds of task folders." It does not. `find aidd_docs/tasks -type d` counts 29
directories and `find aidd_docs/tasks -type f` counts 144 files, 173 entries in total - the
main worktree this one branches from has even less, 15 directories and 61 files. The real
tree is worth timing anyway, since it is the honest answer to "what does the walk cost
today," but it cannot tell you where the cap should sit, because it never gets near it. That
question needed a synthetic tree built to size, separately, and is answered below.

## A period holding a hundred sessions and a year of day files

The committed test (`scripts/__tests__/telemetry-cost-report.test.js`, describe block "a
period that has met a hundred sessions") builds its fixture through the same writers the
hooks and the CLI use: `sink.js`'s `append()` for every request record, and
`record.js`'s `buildSessionStartLine` / `buildFileWrittenLine` plus `appendLine` for every
run file - never a hand-written JSON fixture. It writes one record per day across 365
consecutive days (2025-08-22 through 2026-08-21, one day file each) and one journalled
session per day cycled across 100 distinct sessions, spread across 25 task folders, four
sessions per task. It then shells out to the real CLI, `telemetry-report.js`, exactly as a
person would run it, with `HOME` pointed at an empty directory and `PATH` cleared so the
per-tool local readers (see the opencode finding below) fail fast instead of walking a real
machine.

All three questions answered, and answered fast:

| Question | Command | Wall time | Result |
| --- | --- | --- | --- |
| The period | `report --from 2025-08-22 --to 2026-08-21 --json` | 55-77ms | 365 requests, 100 sessions, every breakdown (`by_step`, `by_model`) sums back to the total in whole micro-dollars, exactly |
| The sweep | `read` | 55-75ms | "100 sessions read, 0 with records" (no local tool files exist for synthetic vendor ids - correct) |
| One task's breakdown | `report --task 2026_08/2026_08_01_task-0 --json` | 55-70ms | 15 of the 365 records, `cost_micro_usd` equal to the sum of `toMicroUsd(cost_usd)` over exactly those 15 records, asserted with `assert.equal`, no tolerance |

The reconciliation assertions compute the expected micro-dollar total independently in the
test, by summing each fixture record's own `Math.round(cost_usd * 1e6)` - never by rounding a
pre-summed float - so an equal in the assertion is a bit-exact match, not a coincidence of
rounding twice the same way. All three totals matched exactly on every run.

`sink.readPeriod()` opens every day file in the directory regardless of the requested range
(see its own doc comment), so 365 day files is the number that mattered to time, not the
100 sessions. It answered inside a JS process startup's worth of overhead - there was no
sink-side cost visible above the ~50ms floor of spawning `node` at all.

### A larger volume than the committed suite carries

A load test that takes minutes does not belong in the committed suite, so the volume above
(100 sessions, 365 day files) is what ships. A one-off script, not committed, pushed further
to see where a real slope appears: 1000 journalled sessions and 1825 day files (five years,
three records a day, 5475 records total).

Building the fixture itself cost 71ms for the 1000 run files and 253ms for the 1825 day
files with three records each. The period report over all five years and all 1000 sessions
answered in 120ms, and the session sweep over the same 1000 sessions, `PATH` cleared,
answered in 976ms - under a millisecond a session, amortized, and still comfortably
interactive.

Five years of day files and ten times the committed session count did not produce a visible
slope in the period report (120ms vs. ~65ms at a quarter of the day-file count is process
overhead, not a scaling curve). The sweep is the one place that grows with session count,
linearly, and stays fast only because the per-tool readers were made to fail fast for this
measurement - see below.

### Finding: the sweep's real cost is per-tool subprocess spawns, not the sink

`telemetry-report.js read` asks every declared tool's reader for every journalled session.
Two readers (`claudeRead`, `codexRead`) are plain filesystem walks under `$HOME` and fail in
microseconds when `$HOME` has nothing to find. The third, `opencodeRead`, shells out to the
real `opencode` binary - `opencode export <sessionId> --sanitize` - once per session, with a
10-second timeout, whenever `opencode` is reachable on `$PATH`. On this machine `opencode` is
installed (`/opt/homebrew/bin/opencode`) and a single call against a nonexistent session id
measured 2.4-2.5 seconds wall time, dominated by the binary's own startup, not by anything
this plugin does. Left on `$PATH`, the same 1000-session sweep that took 976ms with `$PATH`
cleared did not finish in two minutes - at ~2.5s a session that is roughly 40 minutes for
1000 sessions, over 2000x slower than the same sweep without OpenCode reachable. The
committed test clears `$PATH` for exactly this reason, and that choice is the "smaller
volume in the committed test" the task instructions anticipated: the fixture is the full
size asked for, but the sweep's realistic cost on a machine with OpenCode installed is not
something a fast, deterministic unit test can honestly represent without neutralizing it.
This is a real, load-bearing finding about `readers.js`'s `opencodeRead`, not something this
phase's scope covers fixing (`plugins/aidd-telemetry/skills/01-cost/scripts/lib/readers.js`
was not touched).

## The turn-end task-tree walk

`taskFilesModifiedSince` in `plugins/aidd-telemetry/hooks/lib/file-writes.js` had never been
timed. It walks `aidd_docs/tasks` breadth-by-directory, capped at `MAX_SCAN_ENTRIES` entries
examined (directories and files alike), a number that had been 2000 since the file was
written with no measurement behind it.

Timed against this repository's own tree (root of this worktree, 30 repetitions after a
warm-up call): 172 entries examined, 144 files found, not truncated, mean 1.06ms, p95
1.46ms, max 1.52ms. That is 8.6% of the cap, consistent with the premise check above - this
repository is nowhere near where the cap would ever matter.

To find where the cap would matter, six synthetic trees were built under a temp directory,
shaped like a real task tree (one folder per task, a fixed number of files per folder, 8 in
each run below), at 500, 1000, 2000, 5000, 10000, and 20000 total files, each timed over 20
repetitions after a warm-up call:

| Files built | Entries examined | Files found | Truncated | Mean | p95 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| 500 | 564 | 500 | no | 3.18ms | 3.91ms | 4.44ms |
| 1000 | 1126 | 1000 | no | 6.21ms | 7.32ms | 7.38ms |
| 2000 | 2000 | 1749 | yes | 10.98ms | 13.53ms | 16.01ms |
| 5000 | 2000 | 1374 | yes | 9.13ms | 10.10ms | 10.59ms |
| 10000 | 2000 | 749 | yes | 4.76ms | 5.09ms | 5.65ms |
| 20000 | 2000 | 0 | yes | 2.95ms | 3.47ms | 7.20ms |

"Entries examined" is now always exactly the cap once truncation happens, never one more and
never one fewer - the walk had an off-by-one before this phase (`if (++seen >=
MAX_SCAN_ENTRIES) break`), which incremented past the cap before checking it, so the entry
that crossed the cap was never actually opened while still being counted as if it had been.
Fixed as part of this phase; the corrected walk now examines exactly `MAX_SCAN_ENTRIES`
entries whenever it truncates, and the `scanned` field it now returns is exact rather than
off by one.

A second, sharper bug turned up while building the `truncated` flag itself, in a task tree
shaped as one wide directory with no per-task subfolders - the single-`.md`-file task shape
`taskOf()` and `TASK_SEGMENT_PATTERN` both already treat as real. Judging truncation from
"is anything still queued to visit" is wrong: a directory listing cut short mid-read empties
its own queue entry the moment it is popped, before any of its entries are read, so a
cut-short listing and a finished one leave the same empty queue behind. The first version of
this fix read that as "nothing left," reporting `truncated: false` on a listing that had
actually stopped 300 files short - the exact silent-truncation failure this phase exists to
remove, reproduced inside its own fix. The corrected walk tracks the cut directly, at the
moment the budget runs out mid-listing, rather than inferring it from what the queue looks
like afterward. A committed test now builds exactly that flat shape - one directory holding
`MAX_SCAN_ENTRIES + 300` files, no subfolders - and asserts `truncated: true`; run against
the queue-only version it fails with `false !== true`, confirming both that the bug was real
and that the fix addresses it independently of the off-by-one fix above.

### Finding: a wide directory can make the walk find nothing at all, well under any file-count intuition

The synthetic-20000 row is the one worth reading twice: **zero files found**, despite 20000
existing on disk, and despite the walk finishing in 3ms - faster than the 2000-file case,
not slower. The reason is the traversal order, not a bug in the timing: entries are counted
against the budget as soon as a directory's own listing is read, before any of its
subdirectories are opened. With 2500 task folders sitting inside one directory
(`aidd_docs/tasks/2026_08/`), listing that directory alone consumes very close to the entire
2000-entry budget on folder *names*, and the walk runs out before it ever opens a single one
of those folders to look at the files inside. This means the walk's real failure mode is not
"finds most files, misses the tail" - it is "if there are enough task folders open under one
month, finds none of them, and finds them fast, which looks the same on a stopwatch as a
healthy empty period." That is exactly the false-zero this whole layer exists to prevent,
and it is a property of the traversal order interacting with a wide directory, not of the
cap number - raising the cap only pushes the folder-count where this happens further out, it
does not remove it. Fixing the traversal itself is out of this phase's scope (only
`file-writes.js`'s cap and its reporting were in scope, not a redesign of how it walks); it
is recorded here because the acceptance criterion is that a person can tell a real figure
from an inert installation, and this is a specific, reproducible way that promise would
currently fail once a repository has on the order of two thousand task folders inside a
single year-month, which is a difference of two orders of magnitude from where this
repository is today, but not an implausible one over years of the same convention.

### The cap: kept at 2000, and why

`aidd-telemetry-journal.test.js` already enforces a p95 budget of 200ms on the whole
turn-end handler (`processPayload` for a `Stop` event), which runs the task-tree walk before
anything else on that path. Measured just now, against a directory holding several hundred
run files (the harness's own seeded fixture), that whole handler - walk plus the git
shellouts plus the run-file lookup plus everything else on that path - runs at p95 8.5-8.7ms,
essentially all of it outside the walk, since the harness's own task tree is close to empty.
Adding the worst measured walk cost from the table above (13.53ms p95, at exactly 2000
entries) to that existing 8.5-8.7ms baseline lands at roughly 22ms p95, still 9x under the
200ms budget the existing test enforces. There is room to raise the cap on a pure time
budget, but the wide-directory finding above means a higher cap does not buy more coverage
in the shape of tree most likely to grow wide - it only delays exactly the same silent
all-or-nothing failure to a larger folder count, at a cost of comfort now for no real
increase in what a repository this shape can ever actually get walked. Given this
repository's own tree uses 8.6% of the existing cap, and the timings show 2000 is cheap
relative to the shared budget rather than expensive, 2000 stays as it was. It is now backed
by a measurement instead of a guess, and the walk now says when it has been reached instead
of returning a silent, indistinguishable-from-healthy empty list.

## Reaching the cap is no longer silent

`taskFilesModifiedSince` returned a bare array before this phase; a caller reaching the cap
had no way to know it had. It now returns `{ found, truncated, scanned }`, and
`handleTaskFilesObserved` appends a `scan_truncated` line (`{ type: "scan_truncated", at,
cap, scanned }`) to the session's run file whenever `truncated` is true. This is a new line
type, not one of `record.js`'s four (`record.js` was out of scope for this phase), so a
reader that only knows those four - `plugins/aidd-telemetry/skills/01-cost/scripts/lib/journal.js`'s
`readJournalFile` included - ignores it exactly as it already ignores any type it does not
recognise. The fact becomes durable and greppable in the run file rather than nonexistent;
surfacing it in the cost report itself is a separate, later piece of work, not something this
phase's file list (`telemetry-cost-report.test.js`, `file-writes.js`, this document) covers.

Four tests in a new file, `scripts/__tests__/aidd-telemetry-file-writes.test.js` (a new file
was needed because the acceptance criterion "reaching the cap says what was dropped" had no
committed test anywhere, and the existing `aidd-telemetry-journal.test.js` that already
covers `file-writes.js` was out of scope to edit), cover: a tree under the cap reports itself
complete with an exact entry count; a tree over the cap, spread across many task folders,
reports `truncated: true` and `scanned` equal to the cap exactly (proving the off-by-one
fix); the same, but as one wide directory with no subfolders, the shape that broke the first
version of the `truncated` flag (proving that fix); and `handleTaskFilesObserved` actually
appends the `scan_truncated` line to a real run file when the cap is hit. All four run in
under 1.4s total.

## A real multi-step flow, run end to end

Everything above answers "does the pipe hold under volume." Nothing above answers "does a
real chain, run by a real agent through several real skills, actually produce a per-step
figure that adds up." That question needed a live session, not a fixture, and one is
measured below, on 2026-08-22, in a throwaway repository at
`/private/tmp/telemetry-phase4-flow` — `git init`, never pushed anywhere, `aidd setup
--source local --path <this branch's checkout>` then `aidd marketplace add` / `aidd plugin
install` for `aidd-telemetry`, `aidd-context` and `aidd-vcs`, then `node
.../skills/00-init/scripts/telemetry-switch.js on` directly — the switch, never the CLI's
`telemetry on`, which is a different, OTEL-endpoint-backed path this phase does not exercise.

### First attempt: the installation looked complete and produced nothing

The first `claude -p` run against that project (session `f4fcc9a8-…`, cost $1.26783825, 18
turns) completed, wrote two files, and made a commit — Claude read each skill's `SKILL.md`,
`actions/*`, `references/*` and `assets/*` off disk by hand and followed the procedure
verbatim, because the `Skill` tool answered "Unknown skill" for every one of
`aidd-context:05-rule-generate`, `aidd-context:07-command-generate` and
`aidd-vcs:01-commit`. `aidd_docs/runs/` held nothing at all afterward: not one
`session_start` line, meaning the `SessionStart` hook — which needs no skill resolution, only
a registered plugin — never fired either. `claude --debug-file` against the same project
directory named the cause exactly: `Skipping orphaned enabledPlugins entry
aidd-telemetry@aidd-local: marketplace not registered`. `aidd marketplace add` and `aidd
plugin install` had written `extraKnownMarketplaces` and `enabledPlugins` into the project's
`.claude/settings.json` correctly, by inspection, but headless `claude -p` — which, per its
own `--help`, silently ignores a settings file that fails its validation, with no error
dialog — never actually registered that marketplace, and every plugin depending on it,
including the three installed for this flow, loaded as nothing. This is exactly the
false-health mode the diagnostic exists to catch, one layer up the stack from the
diagnostic's own reach: nothing here is a bug in `aidd-telemetry`'s hooks or scripts, and no
line of this plugin's own code was on the path that failed. It is recorded here as a finding
about the `aidd` CLI's marketplace registration under headless Claude Code, not something
this phase's file list touches or fixes.

Passing `--plugin-dir <path>` once per plugin, straight at each plugin's own directory in
this checkout, instead of relying on the marketplace registration, resolved the skills
correctly on a cheap probe (a tool-free prompt asking Claude to name the matching skills by
name only, $0.1663935) and produced a `session_start` line on the very next run. The real
flow below used `--plugin-dir`, not the marketplace path.

### Second attempt: three skills, three steps, one commit

Session `adb80ecd-973c-4136-b9cc-6b45aa987db3`: `claude --session-id adb80ecd-…
--plugin-dir .../aidd-telemetry --plugin-dir .../aidd-context --plugin-dir .../aidd-vcs
--permission-mode bypassPermissions --output-format json`, prompted to run, in order and
only: `aidd-context:05-rule-generate` (one coding rule, "prefer const over let in
JavaScript"), `aidd-context:07-command-generate` (one slash command, `/hello`),
`aidd-vcs:01-commit` (`auto`, staging exactly those two new files). Claude's own end-of-session
accounting: 18 API requests, 21 turns, 265.6s wall, $2.10391075. The run file this produced,
in full:

```
{"type":"session_start","at":"2026-08-21T22:42:21Z", ...,"vendor_id":"adb80ecd-973c-4136-b9cc-6b45aa987db3", ...}
{"type":"step_start","at":"2026-08-21T22:42:26Z","skill":"aidd-context:05-rule-generate", ...}
{"type":"step_start","at":"2026-08-21T22:43:55Z","skill":"aidd-context:07-command-generate", ...}
{"type":"step_start","at":"2026-08-21T22:44:19Z","skill":"aidd-vcs:01-commit", ...}
{"type":"turn_end","at":"2026-08-21T22:46:49Z", ...}
```

Three `step_start` lines, one per skill, in invocation order — 89 seconds between the first
two, 24 seconds between the last two. The first evidence this layer has produced that a chain
of several skills actually opens several intervals, not the two a single skill's before/after
gives a unit test.

### The report reconciles, field by field, with no tolerance

`telemetry-report.js report --json` against that project: one session, 18 requests, four
`by_step` rows — the three skills plus `unattributed`, for the one request that happened
after `session_start` and before the first `step_start` (Claude's own planning turn, five
seconds long, before it invoked anything). Recomputed independently from the JSON, not from
the tool's own printed percentages, every field of every row summed against the period's own
`totals`:

| Step | requests | input | output | cache_read | cache_creation |
| --- | ---: | ---: | ---: | ---: | ---: |
| aidd-context:05-rule-generate | 7 | 16 | 2,608 | 310,694 | 9,094 |
| aidd-context:07-command-generate | 5 | 10 | 1,800 | 230,127 | 6,332 |
| aidd-vcs:01-commit | 5 | 14 | 2,309 | 368,381 | 8,148 |
| unattributed | 1 | 2 | 148 | 16,597 | 18,715 |
| **sum of the four rows** | **18** | **42** | **6,865** | **925,799** | **42,289** |
| **`totals` in the same JSON** | **18** | **42** | **6,865** | **925,799** | **42,289** |

Every column: exact match, integer to integer, no rounding either side, 974,995 total tokens
across all five fields combined. 17 of 18 requests (94.4%) attributed to a step by the tool
itself (`attribution: "tool-stated"`), 1 unattributed — and that one record reads
`unattributed` in its own `by_step` row, with its own totals, never folded into
`aidd-context:05-rule-generate`, the step it happened nearest to in time. That is the second
acceptance criterion this phase names, and it holds because `attribute()` classifies a record
against the interval it actually falls inside, not against whichever interval sits closest.

One number this report cannot give: a dollar figure, per step or in total. `by_tool` names it
outright — `Claude Code: amount unknown` — because the local reader this plugin uses reads
Claude Code's own transcript files, which carry token counts and nothing else; only Claude
Code's *export* path carries a dollar amount, and this flow used the local switch, not the
export-backed `aidd telemetry on --endpoint`. The $2.10391075 above is real, but it comes from
`claude -p`'s own end-of-session accounting, not from anything `telemetry-report.js` read — a
distinction the report itself states plainly rather than computing a dollar figure it cannot
back.

### The diagnostic agrees with the report, on this session, exactly

`CLAUDE_CODE_SESSION_ID=adb80ecd-973c-4136-b9cc-6b45aa987db3 node
.../02-check/scripts/telemetry-check.js` against the same project:

```
  hook fired            ok    1 run file(s), most recent session_start 2026-08-21T22:42:21Z
  session journalled    ok    1 of 1 run file(s) carry more than session_start
  tool files readable   ok    claude: 1 of 1 session(s) read; codex: 0 of 1 session(s) read
  records join          ok    17 of 18 record(s) joined a step, 1 unattributed
  not covered: cursor   --    It writes no token count in any file it produces.
  not covered: copilot  --    Its file carries outputTokens per turn and nothing else — no per-request input figure exists to build a record from.
  not covered: opencode --    read alone: no captured payload establishes that a hook or plugin sees OpenCode's own session id, so these figures cannot yet be joined to a run journal entry.
```

Seven lines, re-run against the same project rather than pasted from memory: the four claims
above, plus one `not covered:` line for each of the three tools the journal sweep cannot
reach at all (`reachableViaJournal` in `telemetry-check.js`).

17 of 18, 1 unattributed — the same split the report computed independently, from the same
run file, through a different code path (`diagnose.js`'s `claimRecordsJoin`, not
`report.js`'s `by_step`). "1 session" is the count both tools give for this project; neither
names a session the other does not. No disagreement to report — the acceptance criterion for
task 2 holds without qualification, on this one real session, where it had not previously
been observed at all.

### Per-tool session anchor, measured live

At the time of this measurement, `resolveSessionAnchor` (`02-check/scripts/lib/session-anchor.js`)
read `CLAUDE_CODE_SESSION_ID` and nothing else, because — per its own comment at the time —
"no other host sets an equivalent variable yet." Two live processes, dumping `env | sort`
from inside themselves, say that comment is no longer completely true:

- **Claude Code**: `claude -p "Run: env | sort..."` (a separate, cheap session, $0.34476850,
  since the real flow above was never asked to dump its own environment) shows
  `CLAUDE_CODE_SESSION_ID=2393fd9c-7805-41e6-8d2f-88a098b787f8` set for the Bash tool call
  that ran `env`, matching that session's own id — the mechanism `telemetry-check.js` already
  relies on, confirmed live rather than by reading `record.js`'s comment about it.
- **Codex**: `codex exec -m gpt-5.4 --skip-git-repo-check
  --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust "Run: env |
  sort..."` (`--dangerously-bypass-hook-trust` exists because of #699 — Codex will not run a
  hook it has not been asked to trust, and says nothing when it doesn't; 17,663 tokens for
  the whole probe, no dollar figure printed) printed `session id:
  01a02683-59fb-7953-b000-2db00a688439` at startup and left
  `CODEX_THREAD_ID=01a02683-59fb-7953-b000-2db00a688439` in the shell command's own
  environment — the identical value, and the same one embedded in the rollout file Codex
  wrote for that session
  (`~/.codex/sessions/2026/08/22/rollout-2026-08-22T00-48-57-01a02683-…jsonl`), which is the
  file `record.js`'s `codexSessionIdFromTranscriptPath` already parses to build a Codex
  `vendor_id`. That `codex exec` ran nested inside a Claude Code Bash call, so its dump also
  carried `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION=1` and
  `CLAUDE_CODE_BRIDGE_SESSION_ID` — the parent's own identifiers, inherited, exactly the
  contamination `hooks/lib/host.js`'s comment on Codex-nested-in-Claude already warns about.
  `CODEX_THREAD_ID` is not one of those: `env | grep CODEX_THREAD_ID` in the parent shell
  that launched it, run separately, finds nothing, so Codex set that variable itself rather
  than passing through something already in scope. Codex *does* expose a session-identifying
  variable to the shell command it runs — `CODEX_THREAD_ID` — and it is the same identifier
  the journal would already attribute the session under. Two honest limits on that finding:
  this was the environment of the shell command Codex ran under three bypass flags
  (`--dangerously-bypass-approvals-and-sandbox`, `--dangerously-bypass-hook-trust`,
  `--skip-git-repo-check`), not necessarily what a normal, trust-gated interactive session
  exposes; and it is the exec'd shell's environment, not independently confirmed to be what a
  *skill's own script* sees inside that shell, the narrower claim the phase brief asked
  about. At the time of this measurement this was a finding to record, not a change to make:
  this phase's brief was explicit that the anchor logic stays as it is, and
  `resolveSessionAnchor` is spawned-from-a-shell code with no payload to read a host from in
  the first place, so widening it to a second host was left as a design decision for whoever
  owns that file next. That widening happened afterward: `session-anchor.js:26` now reads
  `CODEX_THREAD_ID` first, exactly the variable measured here.

No other host was probed live in this phase — Copilot and Cursor were not run here, and
OpenCode's own plugin-side visibility remains the open question the design spec already
names.

## Epic #631's boundaries, against coverage as it stands today

| Boundary | Epic's words | Status today |
| --- | --- | --- |
| the run journal, the diagnostic, the reading, a readable sink, the per-tool facts | Includes | **Met.** All five ran, together, against one real session, in this phase: journal (`aidd_docs/runs/*.jsonl`), diagnostic (`telemetry-check.js`), reading (`telemetry-report.js`), sink (the same run file, read back by both), per-tool facts (the `by_tool` block naming exactly what each tool can and cannot give). |
| Claude Code as the first and only tool proven end to end | Includes | **Met, and no longer the ceiling.** Claude Code is proven end to end again here, live. Per this plan's own resources, a second tool — Codex — was also run end to end on this branch: hooks delivered, hooks fired, journal written, report reconciled. That proof was not repeated in this phase; only Codex's environment was probed here. |
| the collector | Includes | **Not exercised in this phase.** `aidd telemetry on --endpoint <url>` and its OTEL-backed path exist in `cli/`, out of this phase's touch list, and this flow deliberately used the plugin's own local switch instead, per this phase's own instructions. Whether the collector meets its boundary is a claim this phase's evidence does not speak to either way. |
| the four remaining tools (Cursor, Copilot, Codex, OpenCode), export configuration differs | Excludes | **Partially overtaken by events, tool by tool.** Codex now journals end to end (see above) — no longer simply excluded. Copilot's payload is recognised as of today's other phase (`host.js` parses its shape), but its file "carries `outputTokens` per turn and nothing else — no per-request input figure exists to build a record from" (this report's own words, reproduced live above): recognised, still not coverable into a figure, for a data reason rather than a code gap. Cursor was measured, on this branch, as running no plugin-scope hook at all — stays fully excluded, and correctly so. OpenCode remains where the design spec left it: `journal_attributable: false` in this same report — no measurement yet establishes that any hook or plugin sees OpenCode's own session id, so it cannot be joined even in principle. |
| aggregation per person/team/epic, and the upload that feeds it | Excludes | **Still excluded**, unchanged — nothing in `plugins/aidd-telemetry` or `cli/src` aggregates across sessions by anything other than a period or a task. |
| the commit trailer, and linking a delivery folder to its backlog artefact | Excludes | **Still excluded**, unchanged — no trailer, no linkage, found anywhere in this codebase. |

## What remains open

Codex's `CODEX_THREAD_ID` finding was new information, not a fix, at the time this phase was
measured: the anchor stayed Claude-Code-only until someone decided to widen it, and this
phase did not make that call itself. It was widened afterward — `session-anchor.js` now
reads `CODEX_THREAD_ID` first. The `aidd` CLI's marketplace registration silently failing under headless `claude
-p` (the first attempt above) is a real gap in the installation path a real user would take,
not in anything this milestone's own code owns — worth a ticket, not a fix here. OpenCode's
plugin-side session id remains unmeasured, Copilot remains structurally unreadable into a
figure regardless of recognition, and Cursor remains outside the milestone by the epic's own
words, now with a second, independent measurement agreeing it should stay there.
