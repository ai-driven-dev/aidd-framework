# Output contract

## Target

A skill asks what a period or a task cost and receives one object, the same shape whatever tool did the work, carrying both the figures and a statement of what each tool could and could not supply.

## Hard constraints

- One computation, two renderings. The object a program reads and the text a person reads come from the same value; a field can never exist on one and not the other.
- The same files and the same absolute period produce the same output, twice, and in whatever order the records happen to sit in the file. A re-read appends, so line order genuinely differs between machines.
- A period is reported as it resolved, in absolute days, never as it was asked for. A figure a consumer cannot reproduce is a figure it cannot cite.
- What a tool can supply is declared, per route, and emitted beside the figures. A consumer never infers a capability from whether a number happened to be present.
- Every attribution strength appears every time, in a fixed order. Where a strength accounts for nothing, zero is the measurement and is printed as such.
- A record the read could not place, and a line it could not parse, travel with the figures. A partial read must not read as a complete one.
- One tool's reader failing costs that tool's figures and no others'.
- A user reaches a report without ever naming a session. The journal already knows every session identity.
- Adding a tool changes declarations. Neither the aggregation, the renderer, nor the serializer is touched.
- Nothing new is collected. This states, in a shape a program can read, what is already stored and already declared.

## Non-goals

- Pricing, and any amount computed from a rate.
- Making an unmeasurable tool measurable. Naming what it cannot supply is in scope; closing the gap is https://github.com/ai-driven-dev/framework/issues/680, https://github.com/ai-driven-dev/framework/issues/681 and https://github.com/ai-driven-dev/framework/issues/676.
- The skills that will consume this.
- Sending anything anywhere.

## Done-when

- One command answers with an object a program can parse, carrying a version it can refuse.
- Two identical calls, and one call over reordered records, produce identical output.
- A period given as something that is not a day fails naming the flag, never with a stack trace.
- Every declared tool carries what it can supply on each route, taken from its own declaration.
- A tool that cannot be read, one that carries no amount, one that states its own step, and one that did nothing are four distinguishable answers.
- A reader that throws costs its own tool's figures and nothing else.
- `aidd telemetry report` is reachable without anyone typing a session identifier.

## Stakeholders

- Decider: repository owner
- Owner: the telemetry layer
- Consumer: the skills that will report on AIDD work, and the service that prices what they report

## Context

- Ticket: https://github.com/ai-driven-dev/framework/issues/690, whose table records what each tool supplies on each route today.
- Reads the shape delivered by https://github.com/ai-driven-dev/framework/issues/687 and the report delivered by https://github.com/ai-driven-dev/framework/issues/629.
- Absorbs https://github.com/ai-driven-dev/framework/issues/689 as its first phase: the sweep over every journalled session turns one session's reader failure into the whole pass's.
- The measurement that shapes the amount half: no locally-read tool carries a dollar figure, on any reader wired today. Claude Code's `cost_usd` reaches storage only through its OTLP export.
