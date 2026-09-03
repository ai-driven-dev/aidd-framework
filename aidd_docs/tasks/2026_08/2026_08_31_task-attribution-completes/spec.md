# A task declared while the work is still going attributes it, and every tool that can declare one is captured

## Target

Work that follows a task declaration is counted against that task even though the session has not ended, and every tool able to name the task it is on is proven to do so from a payload really taken from it.

## Hard constraints

- A record that arrives after a task was declared, in a session that is still running, is attributed to that task — not lost because nothing has closed the turn yet.
- An interval is never open-ended. Nothing may attribute an unbounded future to the last task a session happened to name; that failure is the reason the closed shape exists.
- A record the journal cannot speak for stays unattributed **and says why**. Silence about a gap is the one outcome forbidden.
- The reason a record is unattributed names which of three cases it is: no task was ever declared in that session; a task was declared but this record precedes it; or a task was declared and the journal falls silent before this record. Three different facts, and a person acts differently on each.
- Every tool that can declare a task does so from a payload really captured from that tool. No derivation stands in for a capture where the tool can be run.
- A tool that cannot declare says so as a measured property, with the reason, the version and the date — and is visible in every table describing coverage, never silently absent.
- What was measured and what was not are distinguishable in anything this work writes down. An event type that exists is not an event observed delivered.
- The shape a person reads is the same whichever tool produced the records.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Computing an amount in currency. Every output still reads `amount unknown`; that is the price table's contract, not this one.
- Making an interval open-ended, or inferring that a flow is still on a task after the journal falls silent.
- Building a tool-call route for OpenCode on the strength of an event type that exists in its binary. Whether such an event is delivered is the question, not the premise.
- Changing which dimensions the report answers, or adding an axis.
- Changing what any tool writes.

## Done-when

- A task declared in a session with no turn end attributes the records that follow it, demonstrated on the built command.
- Each of the three unattributed cases reports its own reason, and no two collapse into one.
- No interval extends past what the journal actually witnessed.
- Codex declares a task from a payload captured from the running binary, and nothing in the fixture set is described as derived from another fixture unless the tool genuinely cannot be run.
- OpenCode's ability to declare a task is settled by measurement: either it declares from a captured payload like the others, or its inability is recorded with what was run, what was delivered, what was not, and the date — and the difference between "not delivered" and "not observed" is stated rather than collapsed.
- Every coverage table names all five tools, including any that cannot declare.

## Stakeholders

- Decider: Baptiste LAFOURCADE, who set the goal that the same output holds on every tool so analysis can be done at every level.
- Owner: the AIDD CLI telemetry read path and the journal hook.
- Consumer: a person asking what a task cost while still working on it.

## Context

- Measured: `task-attribution.ts:69` closes an interval at `closers[i + 1]?.atMs ?? lastMs ?? startMs`, and `:85` matches `>= start && < end`. `lastMs` comes from step starts, turn ends and task declarations only. So a declaration that is the last of those yields `[t, t)` and matches nothing — the ordinary state of a session still running, not only of one that crashed.
- The journal knows moments the interval builder does not read: written-file lines are timestamped activity too.
- Codex is now runnable (`codex-cli 0.151.0`); its task fixture is currently a declared derivation from another capture.
- Measured on OpenCode 1.14.20, three real sessions, 2026-08-31: a plugin does receive `message.part.updated` carrying a `part.type`, alongside `session.status`, `message.updated`, `session.updated` and `session.diff`. **No tool part was observed** — the model answered in text each time, including when asked to use a tool. That does not establish that tool parts are undelivered; it establishes that this measurement produced none. The same repository already carries one instance of that confusion, about `session.created`, and names it.
