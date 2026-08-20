# Step boundaries

## Target

Every session on a supported tool leaves a durable record of which framework step was running when, so that a reader can attribute a session's measured cost to the steps that produced it.

## Hard constraints

- A step is a half-open interval. Its start is recorded as a fact; its end is derived, because no supported tool exposes when a step's work finishes. A step ends at the next step's start, or at the end of the turn that contained it.
- The step's real name is recorded. A vendor value that redacts the name is not acceptable as a substitute.
- No privacy trade. The record must be obtainable without enabling any vendor setting that also logs command lines, tool inputs, or MCP tool names.
- No content. No prompt, no diff, no file body, no tool argument beyond the step's own name.
- The step name is a fact the framework observes, never something a model is asked to emit. A boundary that depends on an agent choosing to announce it does not count as recorded.
- A step still open when its turn ends is distinguishable from a step still open when the session ended without one.
- The record joins to the same session identity the existing measurement layer already uses, so no new correlation key is introduced.
- Ordering within a session is exact. Two events sharing a millisecond must still be ordered, so the record cannot rely on a timestamp alone where a stronger ordering exists.
- Where a tool gives no per-turn identity to the recording layer, the reduced precision is stated in what is stored, never silently presented as exact.
- Adding a fifth tool must not require changing the recording logic, only declaring what that tool exposes.
- The recording layer stays append-only: one line per observation, never re-read to be rewritten.
- A failure to record a step never interrupts, slows, or fails the session it observes.

## Non-goals

- OpenCode. It exposes no configuration-declared hook at all and needs a different artifact entirely; tracked separately.
- Recording when a step's work actually finished. No supported tool exposes it, and inventing an end is out of scope.
- Reading the record. Turning step intervals into a per-step cost breakdown is a separate deliverable.
- Replacing the vendor's own step signal where one already exists. Both may coexist, and a disagreement between them is worth reading rather than suppressing.
- Any breakdown by person, team, or epic.
- Fixing the two defects found while measuring this: a turn-end signal that never fires on one tool, and a session record that never writes on another.

## Done-when

- A skill invoked on any of the four supported tools leaves a step record naming that skill.
- Two skills that interleave within one session produce two distinct attributions rather than one, and their intervals sum without overlap.
- A skill interrupted mid-work leaves a record a reader can tell apart from one that completed its turn normally.
- The step record and the measured cost of the same session join without ambiguity, and the join is reproducible from the stored data alone.
- On the tool that exposes no per-turn identity, the stored record says so, and a reader can see that its attribution is coarser than the others'.
- Per-step attribution is obtainable on Claude Code with the privacy-costly vendor setting left off.
- A session on a tool that has no step boundary at all still produces a valid, readable record rather than an error or a gap.
- No prompt, code, diff, or tool input appears anywhere in what is written.

## Stakeholders

- Decider: repository owner
- Owner: the telemetry layer
- Consumer: the reporting deliverable that turns intervals into a per-step cost breakdown, and any later reader of the same record

## Context

- Ticket: https://github.com/ai-driven-dev/framework/issues/663, whose 2026-08-20 comment records what each of the five tools actually exposes, measured one probe per tool. Two claims in the ticket body were corrected there.
- The load-bearing measurement: none of the five tools exposes the end of a skill's work. That is what forces the half-open interval and rules out an emitted end marker.
- Out-of-scope follow-ups filed while measuring: https://github.com/ai-driven-dev/framework/issues/680, https://github.com/ai-driven-dev/framework/issues/681, https://github.com/ai-driven-dev/framework/issues/682.
- The consumer that motivates this: https://github.com/ai-driven-dev/framework/issues/629, which cannot deliver its per-step block until this lands.
