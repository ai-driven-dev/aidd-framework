# Skill authoring

The contract every generated skill satisfies. `skill-generate` obeys it too.

- **R1.** The router holds only the flow, the action table, and transversal rules. Every destination, criterion, or per-case rule lives in an action or reference.
- **R2.** One skill, one domain. Named per `naming.md`.
- **R3.** `description` is the only always-on text: verb-led, third person, about 240 chars, `Use when the user wants to <intents>` and an optional `Not for <X>`. No colon or dash, no other skill or `/command` named.
- **R4.** `argument-hint`: the action slugs when actions run one at a time, the user's cases (`setup | refresh | rewire`) for a pipeline, omitted for one action.
- **R5.** `name` is not the invocation token: a colon or prefix breaks loading. In prose call a skill `plugin:folder`.
- **R6.** One fact, one home. An action acts within a router rule and cites a shared reference, never restating either. Every citation an action makes, reference or asset alike, is a relative markdown link `[name](path)`. A citation sits where it is used, never gathered in a list of its own.
- **R7.** `references/` are read in place. `assets/` are copied or filled and own their artifact-local fill contract.
- **R8.** References stay flat, nesting one directory deep only as a load boundary. Each stands alone, never pulling in another. It names a sibling in backticks and never links it.
- **R9.** One file, one artifact. Split two apart only when a path needs one without the other.
- **R10.** Budget what a run reads, not file size: the router stays the leanest file.
- **R11.** A section earns its content or is omitted, never invented or reordered.
- **R12.** Every action carries a `## Test` asserting an observable property by real execution, never a mock.
- **R13.** English only, one idea per sentence.
