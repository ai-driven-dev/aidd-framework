---
status: done
---

# A flow the tool named is a flow

## The defect

`by_flow` decides a record's flow from journal intervals and nothing else
(`cost-report.ts`'s `flowKeyOf`). A record whose own transcript states the orchestrating
skill it ran under is reported in the unnamed row, however plainly it says so.

Measured on this machine's sink, period `2026-08-06..2026-09-05`, 30,222 requests, on the
binary built from `9fc819ef`:

| Axis | `aidd-orchestrator:01-sdlc` | Attribution |
| --- | --- | --- |
| `by_step` | 2,220 | `tool-stated` |
| `by_step` | 1 | `journal-interval` |
| `by_flow` | 1,052 | journal interval, the only source it has |

The two axes are not disagreeing about one flow. They are looking at two different
sessions:

- The 1,052 come from the session whose journal holds the corpus's only orchestrating
  `step_start`, window `05:21:27Z -> 09:27:21Z` on 2026-09-04.
- The 2,220 come from a second session, `2026-08-18T11:14Z -> 2026-09-02T19:48Z`, that has
  a journal on disk with **six `step_end` lines and no `step_start` at all**. Every one of
  its 2,699 orchestrating records (2,220 inside the period) carries
  `step_attribution: "tool-stated"` — the transcript itself naming the skill, the strongest
  evidence this system has.

So `by_flow` reports 2,220 requests as belonging to no flow while `by_step`, reading the
same records, names the flow they ran under.

### Correcting two earlier claims

- The plan for #763 compares `by_step` 2,220 against `by_flow` 56 as though both described
  one flow. They never did: the 2,220 were always tool-stated and always came from the
  other session. #763's own fix stands — it moved that session's flow from 56 to 1,052,
  measured on the same journal — but the "40 times fewer" framing overstated what a single
  closer could ever account for.
- The same plan files `buildStepIntervals`'s open last interval (`POSITIVE_INFINITY`) as
  attributing roughly 1,168 requests after the journal stopped witnessing. It does not.
  Neither journal in the corpus has an unclosed `step_start`, and the whole corpus yields
  exactly **one** record attributed by journal interval on this axis. The open interval is a
  real asymmetry, and it is not where a number is wrong.
- That plan also records, as a reason not to close the last interval, that
  `aidd telemetry check`'s `records-join` claim "starts failing for every unclosed session".
  It does not: `joinedVerdict` fails only when `joined.length === 0`
  (`telemetry-claim.ts:432`), never on a ratio.

## Why a session states a step its journal never opened

`step_start` is written by a hook when a skill is invoked. A session resumed after its
context was compacted carries its skills forward in the restored context, so nothing is
invoked again and no hook fires — while the transcript keeps stating the step on every
record it produces. The journal for that session shows exactly that shape: ends without
starts.

This is not an error to repair at the write path. It is a capture the journal cannot make,
and a second source that already made it.

## The change

`flowKeyOf` gains one fallback, and only one: a record that falls inside no flow interval,
whose own `step_attribution` is `tool-stated` and whose `step` names an orchestrating skill,
joins a row for that skill.

Two row kinds, never merged:

| Row | Keyed on | `attribution` | `started_at` |
| --- | --- | --- | --- |
| a flow the journal witnessed | the `FlowInterval` object, by reference | `journal-interval` | the interval's own start |
| a flow only the tool named | the skill name | `tool-stated` | absent |

Keeping them apart is what preserves the property `buildFlowIntervals` argues for: two
orchestrated runs of one skill in one session are two rows, because two intervals are two
objects. A name is not a run, so the tool-stated row cannot make that distinction and must
not pretend to — it is a bucket drawn from many runs, and carries no start for the same
reason the no-prompt row carries none.

**An interval wins over a tool-stated step, and the reason is granularity, not strength.**
`withStepBackfill` prefers a tool-stated step over a journal-interval one, and this
preference runs the other way; the two are not in conflict because they answer different
questions. There, the question is *which skill* — and the tool naming its own skill beats an
inference from a moment. Here, the question is *which run* — and only an interval can say.
A record inside an interval is already inside the run the tool would have named anyway.

## Reconciliation

`by_flow` must keep summing to the period total. The unnamed row loses exactly what the new
row gains; nothing is counted twice, because a record joins the tool-stated row only when it
joined no interval.

## Envelope

No bump. The flow row gains `attribution`, a field a consumer may ignore, and no existing
field changes meaning — the rule stated at `cost-report-envelope.ts`. Every consumer of
`by_flow` is enumerated and updated in the same commit: the terminal display, the `--axis`
artefact, and the envelope's own type.

## Guards

| Guard | Mutation that must kill it |
| --- | --- |
| a tool-stated orchestrating record with no interval joins a row named for its skill | drop the fallback |
| a record inside an interval stays on the interval's row, never the tool-stated one | let the fallback run first |
| a tool-stated step that names no orchestrating skill joins no flow row | drop the `ORCHESTRATING_SKILLS` check |
| a `journal-interval` step attribution never opens a flow row | accept any attribution, not only `tool-stated` |
| every `by_flow` row sums to the period total | remove the record from the unnamed row without adding it elsewhere |

## Proof

Two binaries, `9fc819ef` and this branch, run back to back against one copy of the sink in a
sandboxed `HOME`, period `--days 30`, 30,222 requests on both.

| `by_flow` row | `9fc819ef` | this branch |
| --- | --- | --- |
| `aidd-orchestrator:01-sdlc`, `journal-interval` | 1,052 | 1,052 |
| `aidd-orchestrator:01-sdlc`, `tool-stated` | — | **2,208** |
| no flow | 29,170 | 26,962 |

The unnamed row drops by exactly 2,208, and all eleven breakdowns sum to 30,222 on both.

**2,208, not the 2,220 `by_step` names.** The twelve missing are the twelve tool-stated
records that fall inside the journal's own interval — the precedence rule, visible in real
data: an interval wins, so those twelve stay on the `journal-interval` row rather than
being counted twice or moved.

## Still outstanding

`by_prompt`'s doc comment calls it *"the one breakdown that is complete by construction"*
(`cost-report.ts`, `cost-report-envelope.ts`). Measured the same day on the same sink: 843
of 30,714 records carry no `prompt_id` — 811 of them in one session, all stored under CLI
`5.2.2` before the transcript reader resolved the field, and 90 of the 91 whose transcript
lines survive resolve one today from unchanged bytes. The claim needs correcting to what
the census shows, and the cause named: `storeNewCandidates` freezes a record's field set at
first sight, so a gap a later reader could fill stays permanently. Not folded in here — it
is a different axis and its own argument.
