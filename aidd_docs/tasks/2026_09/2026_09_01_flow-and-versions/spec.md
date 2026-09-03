# A period breaks down by the flow that ran, and every line says which version wrote it

## Target

A person sees what one orchestrated run cost, and can tell which version of the software produced any figure they are reading.

## Hard constraints

- A flow is derived from what the journal already records. Nothing new is captured for it, and no hook changes to produce it.
- A flow spans from an orchestrating skill's own step to the next orchestrating step or the turn's end. Work outside any flow is its own row, named for what is known.
- Which skills orchestrate is **declared**, in one place, reviewable — never inferred from a name, a prefix or a plugin string matched in passing.
- The flow rows reconcile to the same period total as every other breakdown.
- A skill a person ran by hand during a flow counts inside it. That is stated where the figure is read, because the journal cannot tell it from one the orchestrator invoked.
- Each producer stamps its own version on what it writes, and only on what it writes: the journal carries the version of the plugin whose hook wrote it, the stored record carries the version of the CLI that stored it. Neither carries the other's.
- A version is read from the artefact that declares it, never hardcoded and never guessed from a sibling.
- A line written before versions were recorded reads as "unknown version", never as any particular one.
- Nothing gains a field for a version nobody can produce.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Declaring a flow, or changing any hook to emit a flow boundary. The sequence is already recorded; this reads it.
- A stable identity for a flow across sessions. What is answerable is what one session's runs cost, and that is what is claimed.
- Recording the framework's own version on a record. It is not what wrote the line; where it belongs is a separate question.
- Computing an amount in currency.
- Aggregating across repositories or people.

## Done-when

- A period breaks down by flow, over a chosen period, from the shipped command.
- The flow rows reconcile to the same total as the task, backlog, step, model, person and project breakdowns.
- Work outside any flow is its own row, distinct from a flow that ran.
- Two orchestrated runs in one session are two rows, not one.
- Which skills orchestrate is stated in one declared place, and adding one there is the only change needed to make it count.
- A journal line carries the version of the plugin that wrote it, read from that plugin's own manifest.
- A stored record carries the version of the CLI that stored it, read from its own package.
- A line or record written before this change reads as an unknown version, and no figure is lost because of it.
- Where a figure is read, the limit is stated: a skill run by hand during a flow counts inside it.

## Stakeholders

- Decider: Baptiste LAFOURCADE, who asked whether a flow can be understood from the sequence of skills rather than declared.
- Owner: the AIDD CLI telemetry read path, and the journal hook for its own version.
- Consumer: a person asking what one orchestrated run cost, and anyone comparing figures across an upgrade.

## Context

- Measured: skill detection is generic — `skill-detection.cjs:10` matches any `skills/<name>/SKILL.md`, and the argument route reads whatever name the host gives. So an orchestrating skill already produces a step like any other, and the sequence is in the journal. Deriving a flow needs no new capture, which is why none is added.
- Step intervals are flat: a nested skill closes its parent. So a flow cannot be read from nesting — it is read from the sequence, between orchestrating steps.
- No skill declares that it orchestrates. Frontmatter carries `name`, `description` and `argument-hint`. `aidd-orchestrator` holds three skills that plausibly do. That is why this declares the fact rather than matching a plugin name — matching a name in passing is the branching this codebase already carries as a debt elsewhere.
- Three versions exist and are not interchangeable: the framework at `5.9.0`, the telemetry plugin at `0.1.0`, the CLI at `5.2.2`. Two of them have a producer that writes something: the plugin's hook writes the journal, the CLI writes the stored record. The framework's own version wrote neither.
- The hook does not read its manifest today, though `plugin.json` sits one directory away from it. The CLI already reads its own version through a port.
