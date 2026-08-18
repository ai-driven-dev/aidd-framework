---
status: blocked
---

# Instruction: does a record ever leave the machine, and how

Part of [`plan.md`](./plan.md).

**Do not build this phase before the question below is answered.** Phases 1 to 5
write records that git ignores, so they can be deleted without trace. This phase
is the one that makes a record durable and shared, and durable is not undoable.

## The question changed when the store moved

This phase used to be "copy the records into git at commit time", and its only
open point was who owned the git hook. Moving the store into `aidd_docs/runs/`
with its contents ignored reopened something larger: **records now sit in the
repository already, and still enter no history.** So the real question is not how
to copy them, it is where they are meant to go at all.

Two answers, and they are not variations of each other.

| | Committed into git | Sent to the dashboard |
| --- | --- | --- |
| Who can read it | anyone with the clone, forever | whoever the dashboard admits |
| Reversible | no | yes, delete the record |
| Needs | a git hook, and #652's organisational decision | a transport, an endpoint, an identity |
| Aggregates across people | only per repository | across repositories and teams, which is the actual ask |

The second is what the dashboard was always for, and it removes the only
irreversible step in the whole design.

**Decided: the project chooses, and neither answer is the framework's to impose.**
A team that wants its costs in git may have them; a team that wants nothing to
leave the machine may have that too. What the framework owes them is that the
choice is made knowingly, once, with its consequence stated — not discovered
later from an empty report.

## Measured 2026-08-20: only one of the two answers is finished

The private answer needs nothing further. The committed answer needs a mechanism
that does not exist, and here is the measurement that says why.

With records ignored, two worktrees produce two records, and merging both
branches conflicts on nothing. Force-adding them and merging again also conflicts
on nothing, and both survive — so the no-conflict property comes from **one file
per session**, not from the ignore rule. That part of the design holds either way.

What does not hold: a **tracked** record is rewritten by every `Stop`.

```
 M aidd_docs/runs/01M09M42Y5SS6WX3TE5NJ7T0K0__sess-wtA.json
```

That is the permanently-dirty working tree the store was moved out of the
repository to avoid in the first place, arriving back through the other door.

So the committed answer needs the mutable-versus-immutable split — an ignored
in-flight directory whose records graduate into a tracked one when their session
is over. That was considered and dropped earlier for being machinery built ahead
of a decision. The decision is now taken, and the measurement above is the
trigger: **build it when a project first chooses to commit, not before.**

Until then, v1 ships the private answer, which is also the default.

## Asking the question properly

The `.gitignore` block **is** the switch, and no second mechanism is invented:

```
aidd_docs/runs/*          ← records stay local
!aidd_docs/runs/.gitkeep
!aidd_docs/runs/README.md
```

Removing the first line commits them. Keeping it does not. Every developer
already knows how to read this, it is visible in a diff, and a project that has
never thought about it inherits the private default.

The question is asked once, by the CLI gesture of #646, at the moment the
repository opts in — because that is the only moment when someone is already
thinking about telemetry, and asking later means asking someone who has
forgotten. The answer is written to the repository, not to a machine, so it binds
the project rather than whoever ran the command.

## The consequence of keeping records local, stated plainly

This is the half that must not be left implicit. Records live exactly as long as
the checkout does, and four routine actions destroy them:

| Action | What is lost |
| --- | --- |
| `git clean -xdf` | every record — `-x` removes ignored files, and this is a normal thing to run |
| deleting a merged worktree | that worktree's entire history, which on this repository means one feature's whole cost |
| a fresh clone, or a new machine | everything before it |
| CI, containers, any ephemeral checkout | every session, always |

Nothing is lost *in flight* — the record is rewritten every turn, so there is no
pending state waiting to be flushed. What is lost is history, and it is
unrecoverable because no one else ever had a copy.

## What this forces on the report

A report that silently covers three weeks of a six-month project is not a partial
answer, it is a wrong one. So #629 and #617 must **declare the window they can
see**, and say when it looks truncated — the cheapest signal being a store whose
oldest record is younger than the repository's first commit.

A measure that cannot say what it is missing is worse than no measure, because it
gets believed.

## Why the plugin cannot own the git answer

Its hooks only ever see sessions. A commit can be made by a human with no session
running, by a script, by a rebase — only git knows a commit happened, so the
trigger would be a git `post-commit` hook installed by the CLI gesture of #646.

That places one framework capability outside a plugin, which is a real exception
to `docs/ARCHITECTURE.md` and would have to be recorded there as one, with this
reason. The dashboard answer needs no such exception: a session's own `Stop` is a
perfectly good moment to ship a record, and the plugin already runs there.

That asymmetry is itself an argument, and it is worth weighing before the
destination is chosen rather than discovered afterwards.

## What it does, and nothing more

Move records out of the ignored directory, unchanged, one file per session. Not
aggregate, not summarise, not enrich, not prune. Whatever the destination, this
step transports and never interprets — interpreting is #629's job, and doing it
here would put a computed number somewhere it cannot be recomputed.

## The decision it waits on

Both destinations write who-worked-on-what-and-for-how-long somewhere it outlives
the machine. #652 records that this cannot ship without an organisational
decision, and #660 holds the policy work. Two guards make deferring safe: the
record carries no author field, ever, and vendor identity attributes are dropped
at ingest and replaced by one salted label.

Deciding after the data exists is deciding too late.

## Tasks to do

### `1)` Ask the question, once, at opt-in

1. The CLI gesture of #646 asks whether records are committed, and records the
   answer in the repository's `.gitignore` — not in a machine-local config, so it
   binds the project rather than whoever happened to run the command.
2. State the consequence of the private answer **at the moment of asking**: the
   records live as long as this checkout, and `git clean -xdf` removes them.

### `2)` Confirm the owner

1. If git: a `post-commit` hook installed by the CLI gesture of #646, because a
   commit can happen with no session running and only git knows.
2. If the dashboard: whatever ships the record, which is a different concern and
   probably a different plugin — see the layer rule in `docs/ARCHITECTURE.md`.

### `3)` The transport

1. Move only records whose session has not been touched since the last run.
2. Content byte-identical to what the hook wrote.
3. Any failure — unreadable record, no permission, no network — leaves the commit
   and the session alone, and exits 0. Standing rule, and it now covers a network
   that is down as well as a disk that is full.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | The choice is asked once and recorded in `.gitignore`, where a diff shows it |
| 1 | Choosing the private answer prints, at that moment, that `git clean -xdf` destroys the history |
| 1 | A repository that never answers gets the private default, and nothing is committed by surprise |
| 1 | The report declares the window it can see, and says so when the store looks truncated |
| 3 | Two agents on the same task in two worktrees produce two records, and nothing they produce can conflict |
| 3 | A second run with no new session transports nothing |
| 3 | The transported content is byte-identical to what the hook wrote |
| 3 | A failure — unreadable record, no permission, no network — leaves the commit and the session alone, and exits 0 |
| 3 | A week of real work on this repository is journaled and transported, with the attached and out-of-flow shares, and no session lost |
