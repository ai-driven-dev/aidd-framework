---
objective: "A period breaks down by total, model, task, skill, person and project — all six from the shipped command, each resting on a capture really taken from the tool it describes."
status: pending
---

# Plan: the core answers its six questions

## Overview

| Field      | Value                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| **Goal**   | The one missing breakdown, and real evidence under the weakest capture       |
| **Source** | [`spec.md`](./spec.md); the audit at `../2026_08_31_core-capture-matrix.md`  |

## Phases

| #   | Phase                                       | File                         |
| --- | ------------------------------------------- | ---------------------------- |
| 1   | The sixth question gets its breakdown        | [`phase-1.md`](./phase-1.md) |
| 2   | Task capture stops being hand-written        | [`phase-2.md`](./phase-2.md) |
| 3   | OpenCode stops being the tool with no capture | [`phase-3.md`](./phase-3.md) |

**Phase 3 is independent of 1 and 2** — it is evidence for a payload shape, not for the breakdown. If either of the others runs long, it lands on its own.

## Decisions

| Decision                                                                                       | Why                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The task axis is built, and #720's gate is discharged rather than re-litigated                   | The decision record required it be re-argued rather than built by default. The argument was made by the product owner: a framework task is a local unit — the journal declares it, it names a folder in this repository, and it is one of the six questions the core exists to answer. Grouping one machine's records by the task they were written into is not aggregation across people or repositories. |
| One row for "no task", not two                                                                   | The journal records a declaration or records nothing. A session that never declared and a session whose declaration could not be read produce the same absence, so a split would be a promise the data cannot keep. The existing unreadable-lines count already carries that possibility, and this adds no second, weaker signal beside it. |
| A record belongs to at most one task, by construction                                            | `TaskAttributionSource` intervals are closed by the next declaration or by the turn's end — never open-ended, deliberately, so a long session cannot attribute everything it later does to the first ticket it named. Non-overlap is a property of the shape, not a rule this phase invents.                                                    |
| The provider is declared, not stored                                                             | A model name reported by two providers can merge. The information exists at capture (`info.providerID`) and is deliberately unread, for a reason written where the choice was made: no other reader names a provider, and inventing the field would import one tool's vocabulary. The collision has never been observed. Declaring it costs a sentence; building for it costs a contract field and a shape this branch has twice paid for adding speculatively. |
| The captured fixtures are the deliverable of phase 2, not its scaffolding                        | Task capture is the weakest cell in the core precisely because its reader was hand-written against no capture. A test that asserts a value against a payload someone invented to match the parser proves the parser matches itself.                             |

## Resources

| Source                                                     | Verified                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `cost-report-artefact.ts:27-35`                            | seven axes; `task` absent — it is a filter at `commands/telemetry.ts:97`                        |
| `ls scripts/__tests__/fixtures/ \| grep -i task`           | nothing — no captured task declaration on any host                                              |
| `ls scripts/__tests__/fixtures/ \| grep -ci opencode`      | 0, against copilot 8 / claude 6 / codex 4 / cursor 3                                            |
| `task-attribution.ts:14-22`                                | `declared \| inferred`, intervals closed by the next declaration or `turn_end`, never open-ended |
| `record.cjs:189`                                           | the journal writes `{ type: "task_declared", at, path }` and nothing else about a task           |
| `opencode-export.ts:11-14`                                 | `info.providerID` sits beside `modelID` and is deliberately unread, with the reason recorded     |
