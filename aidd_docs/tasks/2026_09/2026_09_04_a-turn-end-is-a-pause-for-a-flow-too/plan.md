---
status: done
---

# A turn end is a pause for a flow too

## The defect

`buildFlowIntervals` closes a flow at the first `turn_end` after it opened. The task axis
stopped doing exactly that on 2026-09-04 — *"a `turn_end` is a pause, not a change of
subject"*, `task-attribution.ts:28` — and measured 78% of one session mislabelled before the
fix. The flow axis never followed, and it is the axis where the error is largest.

Measured on this machine's own sink, period `2026-08-01..2026-09-04`, 30,197 requests:

| Axis | What it names for `aidd-orchestrator:01-sdlc` |
| --- | --- |
| `by_step` | 2,220 requests |
| `by_flow` | 56 requests |

A flow is the wider concept — the orchestration and everything it drove — yet it names 40
times fewer requests than the step inside it. That is the closer, not the data.

The corpus holds exactly one orchestrating `step_start`:

```
journal …bb2a10bd   window 2026-09-04T05:21:27Z -> 09:27:21Z
                    step_start 4, turn_end 12, task_declared 46, file_written 12
                    orchestrating step_start: 1, at 05:56:27Z
```

The flow opened at 05:56:27 and the first `turn_end` closed it at 06:02:34. The session went
on writing into the same task folder until 09:27:21 — six minutes named, three and a half
hours not.

## The change

A flow closes on a `step_end` naming its own skill, and on nothing else but the next
orchestrating `step_start`. The same rule `buildStepIntervals` adopted when `step_end` was
introduced (`step-attribution.ts:82-91`): the only line in the journal that *states* an end
rather than standing in for one, and a `step_end` naming a different skill never closes a
flow it has no claim on.

`buildClosedIntervals` gains an opener-aware `isCloser`. It cannot be expressed otherwise:
"a `step_end` naming *this* flow's skill" is a fact about the pair, and the walk currently
filters closers before it knows which interval is open. The walk becomes a forward scan from
each opener, which produces the identical intervals for every opener-independent closer —
`buildTaskIntervals` passes `() => false` and is unaffected.

Unclosed stays unclosed the same way: the journal's own last witnessed moment, capped at the
report's period end. Never open-ended.

## What this costs, stated

An orchestrating skill that never emits `aidd:step-end` has its flow run to the next
orchestrating `step_start` or the journal's end. That is the same trade the task axis
accepted, and the same one it is now measured against. Only `aidd-dev:01-plan` emits the
marker today; making the three orchestrators emit it is a separate change, in the plugin
tree, and it is what turns this fallback into the exception rather than the rule.

The `step_end` half is therefore exercised by tests alone in this corpus, not by the sink —
said here rather than implied by a green run.

## No envelope bump

`cost_report_version` stays 15. The rule is stated where the number lives: *"Adding a field
a consumer may ignore is not a bump; changing what an existing field means is."* No field
changes shape or vocabulary; a row still means "the records attributed to this flow". The
task axis changed its own closer under the same rule and bumped nothing for it.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| a `turn_end` no longer closes a flow | put `turn_end` back in the closer |
| a `step_end` naming the flow's own skill closes it | drop the closer entirely |
| a `step_end` naming another skill never closes it | compare nothing, close on any `step_end` |
| the next orchestrating `step_start` still closes the one before it | stop treating an opener as a closer |
| an unclosed flow still ends at the journal's last witnessed moment, capped at the period end | end it at the opener, or leave it open |
| a task interval is unchanged by the opener-aware walk | make the forward scan skip the opener itself |

## Proof

Both binaries run back to back against the same sink, same period, same instant:

| | `cost_report_version` | period total | `by_flow` `aidd-orchestrator:01-sdlc` | `by_flow` unnamed |
| --- | --- | --- | --- | --- |
| `origin/next` | 15 | 30,222 | 56 | 30,166 |
| this branch | 15 | 30,222 | **1,052** | 29,170 |

Every one of the eleven breakdowns sums to 30,222 on both runs. Compared row by row, ten of
the eleven are byte-identical between the two reports and only `by_flow` differs - so the
change moved the axis it names and nothing else.

Each guard was killed by its own mutation:

| Mutation | Killed |
| --- | --- |
| `turn_end` back in the closer | the pause guards (3) |
| no closer at all | the `step_end` guards (2) |
| close on any `step_end` | the other-skill guard (1) |
| an opener no longer closes the one before it | 1 flow guard, 2 task guards |
| unclosed ends at its own start | 19 across both axes |
| the scan starts at the opener itself | 23 across both axes |

The axis also gained an end-to-end guard it did not have. `telemetry-flow-axis.e2e.test.ts`
passed unchanged through this diff, and it had to: its fixture ends on a `turn_end` with
nothing witnessed after it, and held no record between a pause and the next orchestrating
step - the coincidence class the unit fixtures were rewritten to escape. One record at
09:55, between the pause at 09:50 and the next opener at 10:00, now separates the two rules,
and putting `turn_end` back into the closer turns three of the five e2e cases red.

Gates: 3416 tests / 306 files, `tsc`, `biome ci`, knip, jscpd, bundle within budget,
368 repository script tests, 0 broken links, cli layering clean.

## Next, and not here

The three orchestrating skills do not emit `aidd:step-end`, so every flow above closed on
the journal's own last witnessed moment rather than on a declared end. Making them emit it
is a plugin-tree change with its own test surface.

## Filed, not fixed here

`by_step` credits `aidd-orchestrator:01-sdlc` with 2,220 requests where the flow, after this
change, credits 1,052. The difference is not a disagreement about the closer: a `StepInterval`
is deliberately left open (`POSITIVE_INFINITY`), so roughly 1,168 of those requests fall after
the journal stopped witnessing anything at all. That is attribution on no evidence, and it is
a sharper case of *"an unknown is never a zero"* than the one this change fixes.

It is not touched here on purpose. `step-attribution.ts:37-52` argues the open reading
explicitly and ties it to `aidd telemetry check`'s own `records-join` claim, so changing it
means re-proving that claim - its own Frame, with its own measurement.
