---
status: todo
---

# Instruction: close what the live backlog runs left open

Earlier rounds judged the skills by reading them. This one ran them. A sandbox project
wires `observe-backlog.js` and `verify-backlog.js` into `.claude/settings.json`, copies the
skills in the flat layout the CLI ships (`.claude/skills/<plugin>-<skill>/`), and a nested
`claude -p` plays the user. Every hook call, with its stdin and stdout, lands in a log.
Nothing below is inferred from a file.

## What the runs decided

Codex's last pass made every backlog writer stage a JSON transaction in
`.aidd/cache/backlog-transactions/` and prove it at the end of the turn. Seven live
scenarios ran against it. Four were refused by the system, two ran out of a 540s cap while
still drafting, and only the read-only `ask` completed. Between them they persisted two
artifacts. Six defects surfaced, and every one was about the protocol rather than about a
backlog being wrong: a rejected transaction could not be repaired or withdrawn, a second
transaction in one turn was refused for the first being spent, `null` read as a value
rather than as an absence, an omitted `actual` was reported as a shape error, an opening
state was compared against the wrong baseline, and an early receipt was compared against
the final graph.

The cause was structural. On a Markdown backlog the hook already holds both states at the
moment of the write: the file on disk is the before, the content about to replace it is the
after, and the frontmatter is the normalized output the protocol asked the writer to
restate. The staged file duplicated it and made the writer keep the two in agreement.

So the declaration became optional. `canonical-transaction.js` still validates one whenever
a writer stages it, which is what a backlog living outside the project would need, and
`plugins/aidd-pm/README.md` states its shape. Nothing requires it: no shipped skill writes
anywhere but Markdown.

After the change, the same scenario ran clean, and an adversarial one showed the guarantee
holding without any declaration at all:

```
ask           set the Story to done, it has a live Task child

write         story in-progress -> done       allowed, one write proves it
Stop          LIVE_CHILD: live child belongs to terminal parent
write         story done -> in-progress       REFUSED, done leads to nothing
write         task -> cancelled               allowed
Stop          MISSING_CANCELLATION: cancelled Task needs Cancellation
write         + Cancellation section          allowed
Stop          exit 0
checker       Backlog valid: 2 artifacts
```

## What an adversarial pass then found, and what it cost to close

Four dedicated challengers went at the result. The one paid to break the hooks found three
faults the live runs never reached, all reproduced by spawning the real hooks:

1. **A turn could not move an artifact twice.** `Stop` diffed the state the turn opened on
   against the state it left, so `proposed -> ready -> in-progress` read as one illegal hop,
   and an artifact created then carried to `done` read as born finished. Both writes were
   legal and both were refused, with no exit but discarding the turn's work. The journal now
   records the status each artifact held before every observed write, so `Stop` judges the
   walk rather than the shortcut. A tool too opaque to read still yields its waypoint, so a
   real jump is still refused.
2. **A tool running from a subdirectory read an empty backlog and called it healthy.**
   `locateBacklog` appended `aidd_docs/backlog` to whatever directory it was given, so a
   `cwd` one level in resolved to a path that does not exist, and both hooks returned zero on
   a backlog they never saw. It now walks up to the project that owns the backlog.
3. **Renaming an artifact was refused as a deletion**, since identity is the file path. The
   journal already fingerprints every file, so content reappearing byte for byte is now read
   as a move. A file renamed and edited in one step still reads as a deletion.

## What the closing runs proved

Six live scenarios ran against the final code, three on an artifact skill and three through
the orchestrator. None hit its time cap.

| Scenario | Write refusals | Turn refusals | Result |
| --- | --- | --- | --- |
| create a Task and set it in progress | 0 | 0 | `Backlog valid: 2 artifacts` |
| carry that Task to `done` in one turn | 0 | 0 | `done`, no `ILLEGAL_TRANSITION`, no `TERMINAL_AT_CREATION` |
| close a Story holding a live child | 1 | 4 | recovered unaided, `Backlog valid: 2 artifacts` |
| orchestrated intake of a support report | 0 | 1 | Defect under `defects/`, born `reported` |
| orchestrated lifecycle event | 0 | 0 | only `status` changed, byte for byte |
| orchestrated health review | 0 | 0 | named the dangling parent, checksum unchanged |

Two are worth naming. Carrying an artifact to `done` inside one turn was refused before the
waypoints existed; it now passes with no refusal at all. And on intake, the first Defect
draft carried an invented `Reproduction`; the turn was refused for the placeholder, and the
writer removed the section rather than inventing steps.

The repository's own gates are green as well: `lefthook run pre-commit --all-files` across
ten checks, and the CLI suite at 2156 tests. The golden build snapshot does not cover the PM
hooks, so what proves the matcher survives a flat build is the 41 targeted tests: carried for
Codex, deliberately dropped for Copilot, untested for Cursor.

## Tasks to do

### `1)` What the hooks still never see

1. **A shell write that never spells the path escapes both hooks.** `touchesBacklog`
   searches the tool input as a string, so a command that builds its path opens no journal
   and leaves `Stop` with nothing to judge. A Task born `done` survived that route
   untouched, while the same file written by a command naming the path collected five
   findings. Closing it means snapshotting the backlog on every write in every project,
   which turns an unrelated `git checkout` into a blocked turn. Decide which cost is worse.
2. **The `PreToolUse` matcher is a name list.** `Write|Edit|MultiEdit|NotebookEdit|Bash|apply_patch|shell|mcp__`
   keeps node from starting on every read, at 65ms a call, but a writing tool named outside
   it never reaches the hook at all, and `isPotentialWrite` never gets its say. Decide
   whether the list is the right shape or whether the cost should come back.
3. **The matcher does not survive the flat build for Cursor or Copilot.**
   `cli/src/domain/formats/flat-hooks-merge.ts` carries it for Codex only, so on those two
   hosts the hook still runs on every tool call. Either carry it, or say why it cannot be.
4. **Project fields are only checked when a declaration lists them.** A record with
   `fields: {}` against Markdown carrying `milestone: M1` produces nothing. This only bites
   a backlog that declares, so it waits for the support that would.
5. **Two sessions that report no identity share one journal.** `hook-event.js` falls back to
   an empty string. Claude and Codex both supply an id; this bites a tool that supplies none.

### `2)` What the skills owe the contract

1. **Five writer actions run 32 to 35 lines against a 20 to 33 budget.** The receipt
   sentence in `## Output` is the cost, and a conformance test pins its wording. Either the
   budget admits a writer is longer, or the receipt gets shorter in all six at once.
2. **`aidd-orchestrator/skills/00-async-dev` fails the router contract on every axis**: 131
   lines, no mermaid flow, no `## Actions` table, routing logic inline, 13 oversized actions,
   3 oversized references, decorative bold throughout, and plugin-qualified capability names
   in prose. Untouched by this work and out of its scope; it needs its own pass.
3. **Four `aidd-pm` actions use prose instead of the `| Case | Pass |` table**:
   `01-ticket-info/actions/01-ticket-info.md`, `03-prd/actions/01-prd.md`, and both
   `04-spec` actions. Three `SKILL.md` ship no mermaid flow: `01-ticket-info`, `03-prd`,
   `04-spec`. All predate this work.

## Test acceptance criteria

| Task | Acceptance criteria                                                            |
| ---- | -------------------------------------------------------------------------------- |
| 1    | Each escape either closes or is recorded as accepted, where a reader will meet it |
| 2    | A writer action fits its budget, or the budget states why a writer is different   |
| 2    | `00-async-dev` gets its own pass; nothing here is fixed halfway                   |
