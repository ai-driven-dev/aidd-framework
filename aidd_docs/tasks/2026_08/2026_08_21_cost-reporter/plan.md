---
objective: "One command answers what a piece of work cost, broken down by step, model and tool, with every attribution's strength printed as a number rather than implied."
status: done
---

# Plan: Cost reporter

## Overview

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| **Goal**   | Something that reads the contract #687 wrote down             |
| **Source** | [`spec.md`](./spec.md), issue #629                            |

## Phases

| #   | Phase                                  | File                         |
| --- | -------------------------------------- | ---------------------------- |
| 1   | Two reads that do not exist yet        | [`phase-1.md`](./phase-1.md) |
| 2   | What a piece of work cost              | [`phase-2.md`](./phase-2.md) |
| 3   | Print it, and print what it cannot say | [`phase-3.md`](./phase-3.md) |
| 4   | Asked from inside a session            | [`phase-4.md`](./phase-4.md) |

## Resources

| Source                                                             | Verified                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aidd_docs/runs/README.md`                                            | `file_written` carries a repository-relative path and deliberately no `task_id`: "task identity is a derivation from the path, and derivations belong to whatever reads the log". This reader is that thing. |
| `aidd_docs/product/metrics-contract.md`                               | Money and the four token counters come from `kind: "request"` only; `active_time_s` from `kind: "session"` only. A `"session"` line is one flush window's delta, never a session total. |
| `cli/src/domain/formats/codex-rollout.ts`                             | Codex resolves a session by `session_meta.id`, and 124 of 330 local rollouts are resumed sessions where that differs from `session_id`. The journal hook writes `payload.session_id`. Phase 1 verifies whether the two spellings can disagree in practice. |
| github.com/ai-driven-dev/framework/issues/631                         | The epic's own definition of v1, stated twice: #687 plus this. The four remaining tools are outside its boundaries by design.                    |

## What the build found that the plan did not

| Finding | Where it went |
| ---------- | ---------------- |
| A period selected by day file name would have put July's work in August's total - proven on real data, two records stamped `2026-07-29` living in `2026-08-21.jsonl`. | Fixed in phase 1: every route now carries a moment of its own, and the read selects on it. |
| `file_written` looked its run file up by `payload.session_id` rather than the identity the hook had already resolved. Harmless on Claude Code, wrong on Codex the day a second host gained an extractor. | Fixed in phase 1, pinned by a test that fails both ways. |
| The plugin hook suite runs under `node --test scripts/__tests__`, not vitest. Phase 1's Codex change broke it and three "gate green" reports missed it. | Fixed, and that command is part of the gate from phase 4 onward. |
| One tool's reader failing aborts the read for every tool: `opencode export` throws on a timeout and nothing catches it. Surfaced as a one-in-three flake in a first draft of the report e2e. | Out of scope here; filed as https://github.com/ai-driven-dev/framework/issues/689 and the e2e was made to seed its sink directly. |
| `docs/FAQ.md` promised that tokens and cost are never copied out of the AI tool's own telemetry. `aidd telemetry read` makes that false. | Corrected in place rather than deferred: it is the sentence people quote when asking what the framework does with their data. |

## Decisions

| Decision                                                                                         | Why                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The computation is a CLI command; the skill calls it                                                 | #629 argued for a skill because, when it was written, no `aidd telemetry` command existed. Four do now, and `read` already writes what this reads. A skill holding its own aggregation would compute the same figures a second way, and two ways of computing one number is how they start disagreeing. |
| The run journal port surfaces `session_start` and `file_written`, reversing its own stated exclusion | The port's comment says those lines "carry no boundary the interval logic needs", which was true for #687 and is the wrong test here: this reader needs the tool and project from one and the task from the other. The exclusion was scoped to step attribution, not to the journal as a source.       |
| Task identity is derived from the written path, not stored                                           | The journal writer already refuses to write a `task_id`, on the ground that a derivation stored as a fact cannot be revised. Reading it here keeps that property: change the derivation and every past session re-derives, rather than carrying a stale conclusion.                                    |
| Attribution strength is printed as three numbers, not as a caveat sentence                           | #629 asked the output to "say attribution is approximate" when skills interleave. A sentence is unreadable at a glance and is either always shown or shown by a rule nobody can check. Three percentages that sum to the total say strictly more, and are assertable.                                    |
| No amount is ever computed, and a missing amount is never a zero                                     | The rates live in the SaaS. A tool whose files carry no dollar figure has an unknown cost, not a free one, and the two must not print the same.                                                                                                                                                     |
| The period, not the task, is the primary selector                                                    | A task is a filter over a period, derived from paths that may not exist for exploratory work. Making the task primary would leave work that touched no task folder unreportable, which is most of the sessions measured so far.                                                                        |
| A period means when the work ran, never when the line was stored                                     | A session read locally days after it happened is appended to today's day file while its records carry their own, older moments — proven on a real Codex rollout, whose records read `2026-07-29` out of `2026-08-21.jsonl`. Selecting by day file would have put July's work in August's total and looked right doing it. Every route was given a moment of its own so the selection has something to stand on; a record still carrying none belongs to no period and is reported as undated rather than placed by the day we heard about it. |
| Every read added here skips a bad line rather than failing                                           | The sink port already promises this for `readRecordsForVendor`, and `parseTelemetrySinkLine` throws on an unknown version. A period-wide read that inherits the throw would let one torn final line from a concurrent write cost a whole day's figures.                                                 |
