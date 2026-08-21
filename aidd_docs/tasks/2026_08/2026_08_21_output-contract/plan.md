---
objective: "One object a skill can consume, identical whatever tool produced the work, carrying what each tool could and could not supply — and a flow that fills it without anyone naming a session."
status: done
---

# Plan: Output contract

## Overview

| Field      | Value                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| **Goal**   | A shape a program reads, and a per-tool statement of what it can expect  |
| **Source** | [`spec.md`](./spec.md), issue #690                                      |

## Phases

| #   | Phase                                       | File                         |
| --- | ------------------------------------------- | ---------------------------- |
| 1   | A reader that fails does not fail the read  | [`phase-1.md`](./phase-1.md) |
| 2   | What each tool can supply, declared         | [`phase-2.md`](./phase-2.md) |
| 3   | A period stated absolutely                  | [`phase-3.md`](./phase-3.md) |
| 4   | One object, two renderings                  | [`phase-4.md`](./phase-4.md) |
| 5   | A flow with no identifier in it             | [`phase-5.md`](./phase-5.md) |

## Resources

| Source                                                              | Verified                                                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/tests/e2e/telemetry-multi-tool.e2e.test.ts`                        | Three tools read in one pass produce three attribution strengths from three different sources, and **no `$` anywhere** — no locally-read tool carries an amount. |
| `cli/src/domain/formats/claude-code-transcript.ts`                      | The local read sets `step` from `attributionSkill` and never a cost; the export path is the mirror image. Capability differs by route, not by tool.              |
| `plugins/aidd-telemetry/hooks/lib/file-writes.js`                       | `WRITTEN_PATH_EXTRACTOR_BY_HOST` holds Claude Code alone, so only its sessions can be attributed to a task. The truth lives in the hook, which `cli/` cannot import. |
| github.com/ai-driven-dev/framework/issues/690                           | The per-route capability table this phase turns into declarations.                                                                                             |

## Decisions

| Decision                                                                                          | Why                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A skill reads the report's output, never the stored records                                          | The two double-count rules, the split between the record kinds, and the `turn_id` dedup would otherwise be re-implemented by every consumer, differently — the failure the decision table in #687 already names for `vendor_field`. One computation, in one place.                             |
| Capability is declared per route, not per tool                                                       | Claude Code carries an amount on its export and not on its local read, and states its own step on the local read and not on the export. A tool-level field could not express the first tool in the table.                                                                                     |
| Presence stays honest; capability is what becomes uniform                                            | Filling an absent counter with zero would give a regular table and a false one — a zero from Cursor and a zero from a session that cost nothing would be indistinguishable. The shape is uniform, the presence is the truth, and the declaration is what tells a consumer which to expect.     |
| Task attribution is declared on the tool and pinned to the hook                                      | Its truth lives in a table inside a zero-dependency script the build copies verbatim, which `cli/` cannot import. `DECLARED_HOSTS` already sets the precedent: declare it, and let a test fail the day the hook's table and the declaration disagree.                                          |
| Determinism is asserted against record order, not only against repetition                            | A re-read appends, so the sink's line order differs between machines and is not something a consumer controls. The insertion-ordered groups are exactly where that would surface, and repetition alone would never catch it.                                                                   |
| #689 is this work's first phase rather than its neighbour                                            | The sweep reads every journalled session, so one reader throwing stops being one session's problem and becomes the whole pass's. Shipping the sweep on a bug already documented would be knowingly degrading it.                                                                              |
| The amount stays absent everywhere on the local route, and the contract says so rather than hiding it | No reader wired today produces a `cost_usd`. A consumer that discovers this from missing fields will assume a bug; one that reads it in a capability block will price the tokens instead, which is what the governor exists for.                                                                |
