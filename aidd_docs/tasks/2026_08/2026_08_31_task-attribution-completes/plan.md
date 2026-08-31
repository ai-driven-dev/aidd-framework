---
objective: "Work following a task declaration is attributed while the session still runs, every unattributed record says which of three things happened, and every tool that can declare is captured."
status: pending
---

# Plan: task attribution completes

## Overview

| Field      | Value                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| **Goal**   | Mid-session attribution, three honest reasons, no derivation left        |
| **Source** | [`spec.md`](./spec.md); the six-questions work it completes              |

## Phases

| #   | Phase                                            | File                         |
| --- | ------------------------------------------------ | ---------------------------- |
| 1   | An interval reaches what the journal witnessed    | [`phase-1.md`](./phase-1.md) |
| 2   | Codex declares from its own capture               | [`phase-2.md`](./phase-2.md) |
| 3   | OpenCode's answer is measured, and bounded        | [`phase-3.md`](./phase-3.md) |

Phases 2 and 3 are independent of 1 and of each other. If one stalls, the others land.

## Decisions

| Decision                                                                                   | Why                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The last witnessed moment is widened using the journal's own written-file lines, and `boundaries` is not touched | `run-journal-reader.ts:55-62` keeps `task_declared` out of `RunJournalBoundary` for a specific reason — pairing it in would let it close a running step early. That reason is about closing steps, not about witnessing time. `filesWritten` is already its own array on the journal, so reading it as a witness of "the journal was still alive at t" carries none of that risk. |
| The interval still never runs open-ended                                                     | `task-attribution.ts:18-22` refuses a boundless interval for a stated reason: no tool exposes when a flow leaves a ticket, so an unbounded one attributes everything a long session later does to the first ticket it named. Widening the witness moves the end later; it does not remove it.                                                                                     |
| Three unattributed reasons, not one                                                          | "No task was ever declared", "this record precedes the declaration" and "the journal stops before this record" are different facts with different remedies. Collapsing them is the same fault the diagnostic was rewritten twice to stop committing.                                                                                                                                |
| The OpenCode spike is bounded before it starts                                               | It has no natural exit if a tool part never appears, and an unbounded spike either burns sessions or quietly becomes a build. Three further runs, varying the model, then the outcome is recorded as measured-and-not-observed with its date.                                                                                                                                     |
| A capture is preferred to a derivation only where the tool can actually be run               | Codex can now be run, so its derivation goes. The standard this leaves behind is narrower than "runnable": `opencode-session-created.json` stays a derivation even though `opencode` is itself on PATH and was run for this very deliverable, because what decides a derivation's fate is whether the *event* was ever observed, not whether the binary exists — the standard `scripts/__tests__/fixtures/README.md` states directly. "No derivations ever" remains wrong either way. |

## Resources

| Source                                             | Verified                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `task-attribution.ts:69,85`                        | `endMs = closers[i+1]?.atMs ?? lastMs ?? startMs`; match is `>= start && < end`, so `[t,t)` is empty |
| `run-journal-reader.ts:19,55-62`                   | `RunJournalBoundary = step_start \| turn_end`; the exclusion reason is about closing steps          |
| `codex-cli 0.151.0` on PATH                        | runnable — but Codex gates hooks on trust; a headless capture needs `--dangerously-bypass-hook-trust`, or the hook never fires and the run is wasted |
| opencode 1.14.20, three sessions, 2026-08-31       | a plugin receives `message.part.updated` with a `part.type`; no tool part observed, model answered in text |
