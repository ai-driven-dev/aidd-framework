# The core answers its six questions, and each answer carries its evidence

## Target

A person asks what a period consumed — in total, by model, by framework task, by skill, by person and by project — and gets all six answers from the shipped command, each resting on a capture that was really taken from the tool it describes.

## Hard constraints

- All six questions are answerable over a chosen period, from the command that already exists. No new command.
- Every breakdown reconciles to the same period total. A row that belongs to no group is its own row, never dropped and never folded into one that was placed.
- Work belonging to no framework task is one row, named for what is actually known: no task was declared in that session's journal. It is **not** split from work whose declaration could not be read — the journal records a declaration or records nothing, so those two produce the same absence and cannot be told apart. The report's existing count of lines it could not read is what carries that possibility, and it already does.
- A record is placed by the closed interval it falls in. Intervals are closed by the next declaration or the turn's end, so none overlaps another and a record can belong to at most one. A record before any declaration belongs to none, and lands in the row above.
- Task capture is evidenced against a payload really taken from each tool that can declare one, with real key sets and synthesised values. A host that cannot declare a task says so as a property of that host, not as an untested branch.
- A tool with no captured payload at all is named as such wherever its coverage is described. An absence of evidence is never presented as evidence of correctness.
- Every answer states the strength it rests on: stated by the tool itself, inferred from a journal interval, or unattributed. A breakdown that cannot say which is not shipped.
- Where two things could be counted as one under a single name, either they are separated or the risk is declared in the tool's own limitation, visible to whoever reads the figure. Silence is not an option.
- Nothing gains a field, a vocabulary or a shape for a collision that has never been observed. What is unproven is declared, and what would settle it is written down.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Aggregating across machines, people or repositories. This groups what one machine stored, by dimensions it already records.
- Computing an amount in currency. No route carries one; a price table is separate work.
- Adding a provider dimension to the stored record. See the constraint above: unobserved, so declared rather than built.
- Changing what the journal records, or what any tool writes.
- Selecting by any axis other than the ones the six questions name.

## Done-when

- Running the report over a period answers all six questions, each as its own breakdown, demonstrated on the built command rather than asserted.
- Each breakdown's rows sum to the same period total as every other.
- Work with no framework task appears as its own row, named for what is known rather than for what is guessed.
- A record falling in no declared interval is counted in that row, and one falling in an interval is counted once, in exactly one.
- Every host that can declare a task has a captured payload behind the value its reader extracts, and the capture says which tool and version it came from and when.
- A host that cannot declare a task is described that way, with the measured reason.
- A tool whose payload was never captured is named as uncaptured wherever its coverage is stated.
- Reading a figure shows what it rests on, without leaving the output.
- Any dimension that can merge two distinct things under one name says so where the figure is read.

## Stakeholders

- Decider: Baptiste LAFOURCADE, who named the six questions as the core the rest rests on.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person asking what their own work consumed, and what it was spent on.

## Context

- Five of the six are answerable today. **The sixth is not**: a framework task exists only as a filter, so a period cannot be broken down by it.
- Task capture is the weakest evidence in the whole core: no captured payload exists for it on any host, and its reader is hand-written for four of them.
- OpenCode has no captured payload of any kind, while every other tool has between three and eight.
- #720 asked for the task axis and was gated by a decision of record requiring it be re-argued rather than built by default. That argument has been made, by the person who owns the product: a framework task is a local unit — the journal declares it, and it names a folder in this repository. Aggregating across people and repositories remains a destination's work; grouping one machine's own records by the task they were written into does not.
- One dimension can merge two distinct things: a model name reported by two different providers. The information exists at capture time and is deliberately not stored, for a reason written down where the choice was made. The collision has never been observed. It is declared, not designed around.
