# Metrics contract

## Target

A consumer outside this repository receives a session's metrics complete enough to price and attribute them, without knowing how any tool writes its files.

## Hard constraints

- Every stored record names the tool that produced it, as a fact on the record. A consumer never infers it from the name of another field.
- Where a tool reports the running step itself, that is what is stored. An interval derived from step boundaries is used only where nothing better exists.
- Every attributed figure says how it was attributed. An attribution the tool stated and one inferred from an interval are not the same claim and are never presented as one.
- An unattributed figure is called unattributed, never "outside any step". The two are indistinguishable on at least one measured tool, and asserting the stronger of them would be inventing a fact.
- The contract is written down, in enough detail that someone can consume it without reading this repository's source.
- Every field says whether it is always present or conditional, under what condition, and what its absence means. An absent counter and a zero counter are different facts and the contract says so.
- The two ways of double counting are stated in the contract, not left to be rediscovered: the two record kinds measure overlapping quantities and are never summed; a re-read is matched on the turn identifier.
- Adding a tool changes a declaration, never the code that assembles the contract.
- Nothing new is collected from any tool. This assembles what is already stored and already journalled.
- Nothing reaches a session. No hook, no critical path, no added latency.

## Non-goals

- Pricing. The rates live in the SaaS, and no amount is computed here.
- Transport. Getting the payload out of the machine, and redacting it on the way, are separate deliverables.
- Presenting anything to a person. A human-readable report is a different deliverable reading this same contract.
- Backfilling records already stored. The contract applies to what is written from now on.
- Attributing a step on a tool where neither the tool nor the journal can say. Naming that as unattributed is in scope; inventing an attribution is not.

## Done-when

- Every stored record names its tool, and a consumer implementing the contract never parses another field to work it out.
- A record produced while a step was running carries that step.
- Each attributed record says whether its attribution came from the tool itself or from an interval, and a consumer can filter on that.
- A record the tools cannot attribute reads as unattributed, distinctly from one attributed to no step.
- The contract document exists, and someone consuming it needs nothing else from this repository.
- The contract states, explicitly, the two ways of double counting and how to avoid each.
- A tool that cannot supply a step at all is named as such in the contract rather than being absent from it.
- Adding a tool to the contract is a declaration; the assembling code is untouched.

## Stakeholders

- Decider: repository owner
- Owner: the telemetry layer
- Consumer: the SaaS that prices and aggregates these figures, and the local report that reads the same shape

## Context

- Ticket: https://github.com/ai-driven-dev/framework/issues/687, whose comments carry the per-path measurements this depends on.
- Replaces the local price table, closed as https://github.com/ai-driven-dev/framework/issues/654 and moved to the SaaS. Once the rates live there, this repository's job is upstream of pricing.
- The measurement that shapes the step half: Claude Code's transcript carries `attributionSkill` per assistant message, exact and unflagged, from roughly version 2.1.220. It is omitted rather than nulled when no skill runs, so its absence cannot be read as "no skill ran".
- The step boundaries in the run journal, delivered by https://github.com/ai-driven-dev/framework/issues/663, remain the only route for the export path and for the tools with no equivalent field.
- Blocks https://github.com/ai-driven-dev/framework/issues/629, and is read by https://github.com/ai-driven-dev/framework/issues/662 when the payload leaves the machine.
