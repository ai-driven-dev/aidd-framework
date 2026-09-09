---
name: telemetry
description: >
  Owns what a session cost and who it was for, under src/contexts/telemetry/ — reading a tool's
  own local files, attributing a figure to a person, a task, a flow or a step, and the sink that
  keeps records per machine. Use when adding a reader for another tool's transcript format,
  changing how a figure is attributed or reported, touching the sink or the identity store, or
  wiring a telemetry port. Do NOT use for what a tool declares about being measured — that is
  `kernel/measurement.ts`, read via the `tools` skill. Do NOT use for installing or removing the
  hook that writes the run journal into a project — that record belongs to `framework`.
---

# Telemetry

`telemetry` answers two questions about work already done: what did it cost, and whose was it.
It never causes the work and never installs anything on a project's behalf. Everything it reads
already exists on disk because a tool wrote it, so the whole context is a set of readers, a set
of attribution rules, and one sink.

Where the sink and the run journal live, what the report renders, and what each tool declares
about being measured are in `aidd_docs/memory/telemetry.md`. Read that for the facts; this page
says where new code goes and what it must not do.

## What goes in

| Concept | Location |
|---|---|
| A rendered answer's shape | `domain/cost-report.ts`, `domain/cost-report-envelope.ts` |
| How a figure is tied to something | `domain/step-attribution.ts`, `domain/task-attribution.ts`, `domain/flow-attribution.ts` |
| Reading one tool's own file format | `domain/formats/` (one module per tool's transcript or export) |
| A stored record and what happens to it over time | `domain/telemetry-sink-record.ts`, `domain/telemetry-sink-retention.ts` |
| Who a session was for, and how strongly that is known | `domain/person-resolution.ts`, `domain/ports/person-identity-reader.ts`, `domain/ports/person-identity-store.ts` |
| Something telemetry needs from outside itself | `domain/ports/` — declared here, satisfied at the composition root |
| The concrete reader behind one of those ports | `infrastructure/` |
| One question the `aidd telemetry` command asks | `application/` |

## How

- **A tool declares, telemetry reads.** What a route was measured to supply, and where a tool's
  transcripts live, are declared in `kernel/measurement.ts` and filled in per tool under
  `contexts/tools/domain/profiles/<tool>/`. Every field there is required on purpose: a default
  would be a capability nobody measured, quietly asserted for a tool nobody looked at. Never add
  a branch on a tool id inside this context.
- **What telemetry needs from another context, it declares as its own port.** `installed-plugins-reader.ts`
  and `ignore-entries.ts` are the pattern: telemetry states the question, `runtime/wiring/telemetry.ts`
  hands it an answer, and no context reaches into telemetry in return.
- A figure with no established denomination is not an amount. A zero whose denomination was never
  established, a credit and a premium request are each their own thing; conflating them is how a
  report lies without ever being wrong about a number.
- An interval derived from the run journal is this CLI's inference, not the tool's statement.
  Keep the two distinguishable in whatever you add — `toolStatedStep` exists for exactly that.
- Follow the use-case and port/adapter rules in `.claude/rules/00-architecture/`.

## Public surface

`tests/architecture/context-boundary.arch.test.ts` holds the list (`PUBLIC_MODULES.telemetry`):
the use cases the `telemetry` command drives, the shapes a rendered answer is made of, the
commit-trailer format the git adapter writes, and the two ports a caller wires a concrete
adapter into (`domain/ports/telemetry-sink.ts`, `domain/ports/version-control.ts`). Nothing
else, and no adapter. Rendering happens in `presentation/display/`, never here.

## How it's tested

- `tests/contexts/telemetry/` mirrors `src/contexts/telemetry/` — a format reader and an
  attribution rule are unit-tier; an adapter against a real temp filesystem is integration-tier.
- A reader for a new tool's format needs a fixture captured from that tool's real output. A
  format module tested only against a fixture this repository wrote proves the parser, not the
  format. See the `test` skill before touching a golden snapshot.
