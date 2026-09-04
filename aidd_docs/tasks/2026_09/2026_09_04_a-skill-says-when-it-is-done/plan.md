---
status: done
---

# A skill says when it is done, because nothing else can

## Frame

### The measured gap

A step interval opens on `step_start` and closes on whichever boundary comes next — another
`step_start`, or a `turn_end`. `turn_end` is a **pause**, not the end of a skill's work, so a
skill that spans several prompts is credited only with its first turn.

Measured on the one session with a complete journal: four `Skill` invocations between
05:23 and 06:02, and the step axis names **6.4%** of that session's 1073 records. The
session went on working for three and a half more hours.

The same fix that worked for tasks — stop letting `turn_end` close an interval — was tried
here and reverted: it gave `aidd-dev:01-plan` 93% of a period, attributing 130M tokens of
implementation to a planning skill. Leaving the interval open is worse still.

### Why no hook can close it

Checked, not assumed. The `tool_result` for both `Skill` and `Agent` comes back in about a
tenth of a second:

```
Skill  05:23:51.590 -> 05:23:51.668   0s
Agent  06:01:12.684 -> 06:01:12.820   0s
```

That is the dispatch, not the completion. `step-starts.cjs` says the same in its own header:
*"no tool measured so far exposes when a skill's work finishes"*. So the end is not something
any host emits and no hook can observe it.

The only party that knows a skill's work is over is the skill.

### What this does not buy

**It does not raise the number of steps.** 86 `Skill` invocations across 180 transcripts of
this project, against 31,435 prompts. Work that ran under no skill still has no step, and
nothing here changes that. What it buys is the *span* of the steps that do exist: a skill
that ran for two hours currently reads as one turn.

### Decisions

**The hook stays the writer.** A script invoked by a skill has no payload, therefore no
session id and no cwd, and cannot find the run file to append to. The precedent is already in
the plugin: `task-declared.cjs` reads a task path out of a tool call's own free-form
arguments, because "naming the file you are about to read is what calling the tool already
requires". A step end is declared the same way — the skill's own last tool call carries a
marker, `PostToolUse` fires with a full payload, and the hook writes the line. Nothing new is
invoked, no second writer of the journal exists, and every host that forwards tool arguments
is covered rather than Claude Code alone.

**The marker names its skill.** Closing "whatever step is open" would close the wrong one
when a skill invokes another. A marker naming a skill with no open interval is ignored.

**A step closed by a stated end is a different strength from one closed by a pause**, and
`StepAttributionSource` already exists to say so. Whether that earns a fifth value is settled
in phase 3, against the same rule that governs every axis here: an attribution says its own
strength.

**One skill emits it in this change.** A mechanism nothing uses is unearned surface, and this
repository deletes those. One skill proves the path end to end; the rest follow only once the
route has run against real work.

## Phases

| # | Phase | Proves |
| --- | --- | --- |
| 1 | The hook writes `step_end` from a marker in a tool call | the line appears, for the named skill, on every declared host |
| 2 | The reader closes an interval on it | a step spanning three turns is one interval, not one turn |
| 3 | The contract says how strong that is | the envelope and the document name the difference |
| 4 | One skill declares its own end | the path runs end to end, measured |

Test first at every phase; each guard ships with the mutation that proves it.

## Result

Measured end to end on the built binary, one journal, two records, the only difference being
whether the skill declared its end:

```
avec step_end     aidd-dev:01-plan  journal-interval  2
sans step_end     [aucune]          unattributed      1
                  aidd-dev:01-plan  journal-interval  1
```

The record made after two `turn_end` lines is the one at stake. Without a stated end the
interval closes at the first pause and that record is unattributed; with one it belongs to
the step that was actually running.

Nine guards, each with the mutation that proves it: no mtime restore (the turn loses a write
it should have observed), a marker that need not name a skill, the hook not dispatching, an
end closing whatever is open rather than its own skill, an end acting as a generic closer,
and a skill whose marker names another skill.

The last of those is the drift guard that matters most: it sweeps every `SKILL.md` under
`plugins/`, and for each one carrying a marker asserts the hook reads back exactly that
skill's own name. A second skill opting in is covered without the test being told, and a
marker that drifts from the pattern fails here rather than silently closing nothing for a
whole release.

`pnpm test` 311 files / 3453 tests; repo-level `node --test scripts/__tests__` 364 pass, the
single failure naming only another session's untracked files.

## What it does not do

It does not raise the number of steps. 86 `Skill` invocations across 180 transcripts of this
project against 31,435 prompts: work that ran under no skill still has no step. What changed
is the span of the steps that exist, and only for skills that opt in — one does today.
