# Skill authoring

The contract every generated skill satisfies. `skill-generate` obeys it too.

## The skill

- **R1.** One skill, one domain. Named per `naming.md`.
- **R2.** `name` is not the invocation token: a colon or prefix breaks loading. In prose call a skill `plugin:folder`.
- **R3.** `description` is the only always-on text: verb-led, third person, about 240 chars, `Use when the user wants to <intents>` and an optional `Not for <X>`. No colon or dash, no other skill or `/command` named.
- **R4.** `argument-hint` names what the user brings: the cases they can ask for (`setup | refresh | rewire`) or the artifact the skill consumes (`request | epic`). One or two words per case, never the action slugs. Present unless no action declares an `## Input`, which means the skill takes nothing.
- **R5.** English only, one idea per sentence.

## The router

- **R6.** The router holds the flow, the action table, and the transversal rules. Nothing else.
- **R7.** The mermaid flow shows every path a run can take: the nominal chain, one entry node per case, a back-edge per loop, a terminal node per outcome. A branch stated in prose is a branch missing from the flow.
- **R8.** The action table is `| Action | Does |`, one row per action file, in run order. `Action` is the bare slug, no backticks and no number. `Does` is a lowercase imperative half-line with no final period. Above the table, one sentence: what to read next, nothing more.
- **R9.** `## Transversal rules` holds the rules no single action or reference owns. A rule stated there is stated nowhere else.
- **R10.** The router is loaded on every call, an action only when its turn comes: the router carries nothing an action or a reference could carry.

## An action

- **R11.** Sections in this order: `## Input` when the action consumes something, then `## Output`, `## Process`, `## Test`. A section earns its content or is omitted, never invented or reordered.
- **R12.** A `## Process` step opens with `**Label.**`, then one imperative sentence. A number is always a step run in order; a case, a branch, a loop back, or a constraint is a dash sub-item of the step it belongs to, never a number. A fenced block is content the action emits, not structure: leave it as its consumer needs it.
- **R13.** `## Test` is a `| Case | Pass |` table, each row observable by real execution, never a mock.

## A reference

- **R14.** References stay flat, nesting one directory deep only as a load boundary. Each stands alone, never pulling in another. It names a sibling in backticks and never links it.
- **R15.** A reference carries one fact per row: a table, a mermaid, or a list. Prose is what is left when neither fits.

## An asset

- **R16.** An asset states how it is filled and what is removed. Nothing of its scaffold survives in the artifact produced from it.

## Across all of them

- **R17.** One fact, one home. An action acts within a router rule and cites a shared reference, never restating either.
- **R18.** A citation is a relative markdown link, `[name](path)`, never an `@` include: nothing resolves those. It sits in the sentence that uses it, a `## Process` step to read the file, an `## Output` or `## Test` line to conform to it. Never a block or a line of its own.
- **R19.** One file, one artifact. Split two apart only when a path needs one without the other.
