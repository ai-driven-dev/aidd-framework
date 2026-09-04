# A task folder says which backlog item it delivers, and a period breaks down by it

## Target

A person asks what a backlog item cost and gets an answer, because the task folder that delivered it says which item it was.

## Hard constraints

- A task folder declares the backlog item it delivers, in a file a person can open, read and correct by hand.
- One authority. Nothing else in the folder declares the same thing, and nothing copies what the backlog artefact already holds — not the type of work, not the originating ticket.
- The link names the artefact on whatever support it lives: a reference where the backlog lives with a forge, a project-relative path where it lives in Markdown. Both are the same field.
- A task folder that declares nothing is a normal state, never an error and never a warning.
- Whatever writes the link records when it was written and by what, so a wrong one can be traced to the act that made it.
- A period breaks down by backlog item, and those rows reconcile to the same total as every other breakdown.
- Work whose task declares no backlog item is its own row, named for what is known. Work belonging to no task at all keeps the reasons it already has, unchanged.
- Nothing is written into a task folder by the read path. Reading what work cost never modifies the work.
- What the journal already records is not recorded a second time. Which step produced which file is derivable from it, and a second copy that can disagree is worse than no copy.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- A steps journal, produced-file lists, `branch` or `pull_request` in the declaration. The run journal already carries the first two by timestamped line, and git carries the others.
- A second identity for a task. The folder path is the identity.
- Any status. The artefacts' own frontmatter owns that.
- Reading a forge. The link is a string this repository stores; resolving it to a title or a state is a destination's work, not this one's.
- Aggregating across repositories or people.
- Computing an amount in currency. Every output still reads `amount unknown`.

## Done-when

- A task folder declaring a backlog item produces a report row for that item, over a chosen period.
- Those rows reconcile to the same total as the task, step, model, person and project breakdowns.
- A task declaring no backlog item appears as its own row, distinct from work belonging to no task.
- A declaration naming a forge reference and one naming a project-relative path both resolve, as the same kind of row.
- A malformed declaration costs its own row's resolution and no figure, and says so.
- Running the report leaves every task folder byte-identical.
- The declaration records when it was written and by what.
- Nothing in the repository states that which step produced which file needs recording a second time.

## Stakeholders

- Decider: Baptiste LAFOURCADE, who asked to move from "this task cost X" to "issue #661 cost X".
- Owner: the AIDD CLI telemetry read path, and whichever skill creates a task folder.
- Consumer: a person asking what an item on their backlog actually cost to deliver.

## Context

- This is the irreducible half of #649. The rest of what that issue asks for has since been delivered elsewhere: the journal writes `step_start { at, skill }` and `file_written { at, path, source }`, both timestamped, so which step produced which file is derivable by the same interval mechanism task attribution already uses. #649's own scope excludes tokens, cost, model and duration "because those come from telemetry"; steps and produced files now fall under that same reasoning.
- The task folder path is already an identity, so a second one would be two names for one thing. `branch` and `pull_request` are derivable from git and from the forge.
- Nothing in the repository knows a backlog item today: no `metadata.json` exists, and no issue field exists on the record or in the journal.
- The rule the link follows is the framework's own, at `plugins/aidd-pm/skills/10-task/references/persistence.md:13` — *"Use native fields when supported; otherwise use stable ids, URLs, or project-relative paths. Keep one authority across supports."*
- The boundary this sits inside: the decision of record says the framework exposes and the destination analyses. Grouping one machine's records by an item a local task folder names is the same shape as grouping by task, which was argued and built on the same ground. Aggregating across people and repositories stays a destination's work.
