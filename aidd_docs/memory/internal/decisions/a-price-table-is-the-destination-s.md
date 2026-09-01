# A price table is the destination's, and an amount stays unknown until one supplies it

- Date: 2026-09-01
- Status: Accepted — closes the open question in #654
- Decided by: proposed here, for @blafourcade to confirm or overturn

## Context

Every figure the report prints today reads `amount unknown`. The machinery for an amount
exists and is exercised: `CostTotals.costMicroUsd` sums, reconciles across every axis, and
orders the rows of every breakdown when it is present. What is missing is a source.

No AI tool supplies one. Each of the five declares `amount: false` in its own registry
entry, and each declaration carries the measurement behind it:

- **Claude Code** writes no amount on the line that carries the counters.
- **Copilot** writes `modelMetrics.<model>.requests.cost`, which is a premium-request count
  times a per-model multiplier and is invariant to consumption — measured across fourteen
  local sessions, it read `0.33` for every single-request `claude-haiku-4.5` session
  whatever the tokens spent. It is a quota unit, not a currency amount.
- **OpenCode** writes `info.cost`, `0` in every message captured.
- **Codex** and **Cursor** write none.

So an amount can only come from one place: a table mapping model and token kind to a price,
held by this framework and multiplied against the counters it already reads.

## Decision

**The framework does not carry a price table.** An amount stays `unknown` until something
outside the framework supplies one — a destination, or a tool that starts writing an amount
of its own.

The argument is the boundary already decided in
`measurement-may-reach-a-hosted-destination.md`, clause 4:

> **The framework exposes; the destination analyses.** [...] What runs on a machine stays
> deliberately light: it records, it exposes a documented record, and it answers a small
> number of direct questions through its skills. This is a boundary, not a staging order —
> local does not grow into an analytics product while waiting for one.

A price table is analysis, on three counts, and each is the reason it belongs on the other
side of that line:

1. **It is not measurement.** Every other figure in a record is read from a file a tool
   wrote. A price is asserted by whoever holds the table, and multiplying it against the
   counters produces a number no file on the machine ever contained. The report would print
   it beside figures that were measured, in the same column, with nothing to tell them
   apart.
2. **It goes stale in a released binary.** Prices change per vendor, per model, per tier,
   and on the vendor's schedule. A table compiled into the CLI is wrong from whenever the
   next price change lands until whenever a person happens to upgrade — and it is wrong
   silently, which is the failure mode this codebase refuses everywhere else. "An unknown is
   never a zero" applies here as much as anywhere: a stale price is worse than no price,
   because it looks like an answer.
3. **It is per-account, not per-model.** A negotiated rate, a subscription that makes
   marginal token cost zero, a bundled quota like Copilot's premium requests — none of these
   are derivable from the model name. The entity that knows what the work actually cost is
   the one holding the contract, which is a destination, never a hook on a laptop.

## What this costs, stated rather than hidden

The report is a cost report that reports no cost. That is the real price of this decision
and it should not be softened: a person asking "what did this week cost" gets tokens and
requests, and has to do the last step themselves.

Two things make it liveable, and both already ship:

- `amount unknown` is printed as a fact, on every axis, never as `0` or as an absence a
  reader could mistake for free work.
- The counters are broken out by model on every axis, so a person or a destination holding
  their own rates can finish the calculation exactly, without re-reading anything.

## Consequences

- `#654` closes as answered, not as done. The capability it asks for lands in a destination.
- `CostTotals.costMicroUsd` stays. It is not dead: it is the field a destination writes into
  when it does the multiplication, and the sort key every breakdown already prefers over
  tokens when it is present.
- A tool that starts writing a real amount is a registry change and nothing else — flip its
  `supplies.amount` and read the field. This decision forbids the framework asserting a
  price, never reading one a tool stated.

## Overturning this

Two facts would justify revisiting it, and neither holds today: a vendor publishing prices
in a form the framework could fetch and version rather than compile in, or a majority of
supported tools starting to write amounts of their own. Absent those, adding a table here is
the framework growing into the analytics product clause 4 says it does not grow into.
