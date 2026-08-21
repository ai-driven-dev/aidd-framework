# Cost reporter

## Target

Someone who has just finished a piece of work asks what it cost, and gets an answer broken down by step, by model and by tool, with the strength of every attribution visible rather than implied.

## Hard constraints

- The figures come from the stored records and the run journal. Nothing new is collected, no tool is re-read, no process needs to be running.
- Money and tokens are taken from `kind: "request"` records only; active time from `kind: "session"` records only. Summing across the two kinds is the failure the metrics contract exists to prevent, and the reporter is the first thing that could commit it.
- A tool whose files carry no amount prints tokens and says no amount exists. It never prints a zero, which reads as free.
- The three attribution strengths reconcile to the total exactly: what the tool stated, what an interval derived, and what nothing could attribute. Unattributed is printed as unattributed, never folded into a residual bucket that reads as "no step".
- A tool that cannot be measured at all is named in the output with the reason from its own declaration, so silence is never read as zero.
- A period with no records prints zeros and exits 0. Absence of work is not an error.
- Adding a tool is a declaration. The reporter names no tool.
- A torn or unknown-version line is skipped, never fatal. One bad line in a day file must not cost the whole period.

## Non-goals

- Pricing. No rate table, no currency conversion, no computed amount. An amount is printed only where a tool's own files already carried one.
- Aggregation per person, per team or per epic.
- Sending anything anywhere.
- Backfilling. The reporter reads what is stored; records written before the tool and step fields existed simply carry less.
- Making an unmeasurable tool measurable. Naming the limit is in scope; closing it is not.

## Done-when

- One command answers what a task cost, and the same figures are reachable for a period with no task.
- Every printed breakdown reconciles to the total it belongs to, and the reconciliation is asserted, not eyeballed.
- The attribution mix is printed as numbers, so a reader sees how much of the breakdown is measured and how much is inferred.
- A tool with no local amount, and a tool with no local measurement at all, are each visible and distinguishable from a tool that did nothing.
- A session whose journal is missing still yields its figures, unattributed.
- The skill in the plugin calls the command; no figure is computed twice.

## Stakeholders

- Decider: repository owner
- Owner: the telemetry layer
- Consumer: a developer or tech lead asking where the effort went, and the local report that precedes the SaaS

## Context

- Ticket: https://github.com/ai-driven-dev/framework/issues/629, whose body predates three changes: the OTLP `skill_activated` carry-forward it describes was replaced by #687's two attribution sources, `#647` in its `depends_on` was demoted by #684, and its "why a skill and not a CLI command" argument was written before `aidd telemetry on|off|receive|read` existed.
- The shape being read: `aidd_docs/product/metrics-contract.md`, delivered by https://github.com/ai-driven-dev/framework/issues/687.
- The step boundaries and the `file_written` lines: `aidd_docs/runs/README.md`, delivered by https://github.com/ai-driven-dev/framework/issues/663.
- Task identity is a derivation from a written path, stated as such in `aidd_docs/runs/README.md`. It needs no task identity file, so https://github.com/ai-driven-dev/framework/issues/649 does not block this.
- The rates live in the SaaS, https://github.com/ai-driven-dev/framework/issues/654 closed. This repository is upstream of pricing.
- Last piece of the technical v1 named by the epic https://github.com/ai-driven-dev/framework/issues/631.
