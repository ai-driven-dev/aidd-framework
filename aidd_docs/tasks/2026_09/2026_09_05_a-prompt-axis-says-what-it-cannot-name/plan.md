---
status: done
---

# A prompt axis says what it cannot name

## The false claim

Four places called `by_prompt` *"the one breakdown that is complete by construction"*, and
three of them backed it with one measurement: *"measured 2026-09-04 on the built binary,
1073 of 1073 records of one real session carried a `prompt_id`"*.

Measured on this machine's own sink the following day, 30,714 records:

| | Records | Why |
| --- | --- | --- |
| carry a `prompt_id` | 29,869 | |
| carry none | **845** (2.75%) | |
| — of which, stored before the CLI stamped a version | 34 | an older reader |
| — of which, one session under `5.2.2` | 810 | stored before this resolution shipped |
| — of which, written by the current reader | **1** | a `parentUuid` chain reaching no line that names a prompt |

Every one of the nine sessions in the sink has at least one record with no prompt.

The measurement behind the claim is also no longer reproducible. That session's transcript
holds 230 assistant lines today where 1,073 records were read from it, so a fresh read
yields nothing like 1,073 — the figure describes a file state that no longer exists.

## What is true, and now written instead

`by_prompt` is **the one breakdown no host limit can empty**: every other depends on a
capture that may not have happened — a run journal, an identity file, a task declaration, a
host that names the skill it is running — while this one depends on a field the transcript
reader resolves for itself, walking `parentUuid` back to the line that named the prompt.

That is not the same as complete, and the difference has a mechanism worth naming.

## Why 844 of them can never be named

`storeNewCandidates` treats a candidate whose turn is already stored as a correction only
when it carries a **larger counter**. A field the stored record lacks is not a correction, so
a reader that later learns to resolve something an earlier one could not names nothing
already stored: the turn matches, the counters have not grown, the candidate is dropped. A
record's field set is fixed the first time its turn is seen.

## Why that is left as it is

Re-reading is not the repair. Of the 811 records whose sessions were measured against the
transcripts on disk:

| | Records |
| --- | --- |
| the request is still in a transcript and a prompt resolves today | **90** |
| the request is still in a transcript, the chain reaches no prompt | 1 |
| the request is in no transcript on disk at all | 720 |

Roughly 90 records in 30,714 is the whole prize. Enriching would mean appending a line whose
counters equal one already stored, which `collapseSupersededTurns` picks between by counter
weight and then by serialized content — so the merge would have to learn a preference it does
not have, for 0.3%. Stated as a limit at `storeNewCandidates`, with the arithmetic, and the
condition under which to revisit it: a reader learning a field that matters more than a
prompt id.

## The change

Prose only. No behaviour moves, no envelope field, no version.

| File | Was |
| --- | --- |
| `cost-report.ts`, `CostReportPromptRow` | "complete by construction", the 1073 of 1073 measurement |
| `cost-report-envelope.ts`, the version-13 paragraph | the same claim, the same measurement |
| `cost-report-contract.md`, twice | the same claim; the remainder row described as a host limitation only |
| `03-report.md` | "since every record the reader stores already carries the turn it came from" |
| `cost-report.unit.test.ts`, `aidd-telemetry-cost-skill.test.js` | the claim repeated in two comments |
| `read-local-cost-use-case.ts`, `storeNewCandidates` | the frozen field set undocumented |

## No new guard, and why

The behaviour is already guarded, and correctly. `claude-code-transcript.unit.test.ts`
covers a chain that reaches no prompt, a parent the transcript does not hold, and a chain
that points back at itself; `cost-report.unit.test.ts` covers the unnamed row staying
undated, placed last, and reconciling to the period total on every counter. Nothing here
changes what any of them assert — the defect was in what the code claimed about itself, not
in what it did.
