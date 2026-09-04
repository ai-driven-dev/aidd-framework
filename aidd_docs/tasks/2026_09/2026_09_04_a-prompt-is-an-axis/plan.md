---
status: done
---

# A prompt is an axis

## Why

The report has ten breakdowns. Every one of them can read low, and each for its own honest
reason: a step axis reads a few percent because the host names a skill on the main thread
alone; a task axis needs a journal; a person axis needs an identity file; a backlog axis
needs a declaration. Each is a capture that may or may not have happened.

One field is on every record already. Measured today, on the built binary, against a
sandboxed copy of one real session (1073 records ingested from a main transcript plus its
20 subagent files):

```
requests 1073
with prompt_id 1073 (100.0%)   distinct prompts 12
with agent_name 972 (90.6%)
subagent records with prompt_id 972 / 972
```

That is not a capture to build. `resolvePromptId` in
`cli/src/domain/formats/claude-code-transcript.ts` already walks `parentUuid` inside each
file and resolves every usage line, subagent files included. The axis is grouping and
rendering over a field that is already there.

So `by_prompt` is offered as the axis that is complete by construction, not as a way to
raise another axis. It answers "how did this period's spend distribute across the turns
that caused it", and its id is greppable in the person's own transcript.

## Two earlier claims this plan corrects

Both were measured against a sink written by an older build, and both were wrong:

- **"`prompt_id` is missing on most records."** It is on 1073/1073, subagents included.
  Nothing to build. Item 3 of the ranked list is closed by measurement, not by work.
- **"`prompt-matched` never fires."** It fires: 9 requests on that session
  (`aidd-refine:01-brainstorm` 8, `aidd-orchestrator:01-sdlc` 1).

## The honest ceiling this does not move

On that same session, 973 of 1073 records are `unattributed` on the step axis, because the
prompts they belong to carried no `step_start`. `by_prompt` names those 973 by the prompt
that caused them. It does not name a skill for them, and this plan does not claim it does.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Row shape | `{ prompt?, startedAt?, totals }` | `prompt` absent is the row for records that carried none — every non-Claude tool today. Same shape as `by_agent`'s main-thread row and `by_model`'s unknown-model row: an absent key is a named row, never a merge. |
| Absent key | a `Symbol`, not a reserved string | a prompt id is opaque; no string is safe to reserve. Same reasoning as `NO_AGENT` and `NO_KNOWN_MODEL`. |
| `startedAt` | earliest `event_timestamp` in the prompt, to the second | an opaque id alone is unreadable. The moment orders the rows and locates the turn in the person's own transcript. Derived from a field already on every record — no new capture. |
| Order | largest first, like every axis but `by_day` | the question is which turn cost the most. `by_day` is chronological because a series read out of order is not a series; a ranking has no such property. |
| Printed rows | top `MAX_PRINTED_PROMPTS`, then a count and `--json` | this is the first axis whose cardinality is unbounded: one row per turn, 12 on a session and 31,435 over the measured history. `by_day` suppresses every row above its cap because a partial series is a lie about continuity; a partial ranking is not — it is a top N, and it says so. The envelope still carries every row. |
| Envelope version | 12 → 13 | a new top-level breakdown. A consumer summing every breakdown's `requests` against `totals.requests` has one more to include. |

## Out of scope, named

- **Deduplicating on content instead of on `turn_id`.** 474 duplicates exist in the live
  sink. That fix touches the write path and gets its own task; the claim that the current
  key is `turn_id` must be re-read from the adapter before that plan is written, not
  carried over from a summary.
- Attributing a step by prompt range rather than by time range.
- `aidd telemetry identity` (`by_person`), `backlog-link.json` (`by_backlog`).

## Phases

| # | Phase | Done when |
| --- | --- | --- |
| 1 | The domain groups by prompt | `byPrompts` reconciles to `totals.requests`, an absent `prompt_id` is its own row, rows are largest first, `startedAt` is the earliest moment in the group |
| 2 | The envelope carries it | `by_prompt` present, version 13, the fixture regenerated, every consumer of the version enumerated |
| 3 | A person can read it | the text report prints the axis under its cap and says what it withheld above it; `--axis prompt` returns its artefact |
| 4 | Proven end to end | the built binary reports the axis on the sandboxed real session, reconciling to the same total as every other breakdown |

Every guard ships with the mutation that proves it.

## Measured, end to end on the built binary

Sandboxed copy of one real session (`HOME` and `AIDD_TELEMETRY_DIR` both under the
scratchpad), `aidd telemetry report --from 2026-09-04 --to 2026-09-04`:

```
by_prompt  rows  12  requests 1073   named 12, dated 12, remainder rows 0
by_agent   rows   4  requests 1073
by_step    rows   7  requests 1073   (96% of tokens unattributed)
totals.requests 1073                 cost_report_version 13
```

The axis reconciles to the same total as every other breakdown and leaves nothing in a
remainder, on the same session where the step axis cannot name 96% of the tokens.

## Two gaps this closed on the way

- The skill's `--axis` enumeration and its question table both omitted `agent`, which had
  shipped two versions earlier. A person asking "which subagent spent this" was told the
  question had no axis while the binary had been answering it. Both now name every axis, and
  a guard reads `ARTEFACT_AXES` from the module itself and asserts the two lists are equal -
  in both directions, since the e2e that runs every command the skill names expands that
  enumeration to its first alternative alone.
- That e2e's placeholder expansion held its own copy of the axis list, so a skill could not
  name a new axis without the regex being edited in the same breath. It now expands any
  `<a|b|c>` by its shape.

## Cost

Bundle 588.4 -> 590.6 KB, budget raised 590 -> 593 with the measurement recorded beside it.
