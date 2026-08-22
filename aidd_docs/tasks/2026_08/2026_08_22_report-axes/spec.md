---
status: draft
---

# Spec: a report you can ask along the axis you care about

## The ask

Report globally — a day, a month, a project, a person — and let a skill offer the axes and produce the artefact each one calls for.

## What exists

One period, three breakdowns: by step, by model, by tool. Plus a `--task` filter. That answers *where* consumption went, on the whole machine, over one span.

Four questions it cannot answer:

| Question | Why not |
| --- | --- |
| Which day was expensive? | No breakdown over time; the period is one total |
| What did this repository cost? | A stored record carries no project |
| What did this person cost? | Nothing records an identity, anywhere |
| Across my machines? | Everything is local, by design |

## What this covers, and what it does not

**In:** time and project. Both rest on facts already established — every record carries the moment the work ran, and the run journal already resolves the repository the session ran in. Neither needs a new measurement.

**Out:** person and machine. Those are not a grouping over data we hold; they need an identity that nothing records, and a decision about what may be recorded about someone. That is a separate piece of work with its own consent question, and folding it in here would answer it by accident.

## An axis is not a flag

Adding `--by day --by project` to a command is the small half. The larger one is that a person asking "what did last month cost" does not know which axis answers them, and the answer is worth different things in different shapes: a total to quote, a series to see a spike in, a table to paste into a report.

So the skill's job is to ask what the question is, choose the axis from the answer, and produce the artefact that question deserves — not to print one shape and leave the reader to reformat it.

## Done when

- A report can be grouped by day and by project, and each grouping reconciles to the period's total exactly.
- A record stored before this exists reads as belonging to no known project, never as belonging to a guess.
- A day on which nothing ran appears as a zero row rather than being omitted, because a gap in a series reads as continuity.
- A skill offers the axes in the language of the question, and writes an artefact suited to the answer rather than one shape for all of them.
- Every figure in an artefact is traceable to the same numbers the machine-readable envelope carries — an artefact is a rendering, never a second computation.

## The trap this must avoid

Two ways to compute the same figure is how a breakdown starts disagreeing with its own total. The renderings read the envelope; they do not re-aggregate the sink.
