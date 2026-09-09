# Resolve one person across tools and machines

## Target

A local report counts one human once, whatever tool or machine produced the records, and says out loud which raw identities it could not place rather than folding them into someone or dropping them.

## Hard constraints

- A raw identity that the mapping does not cover is reported as unresolved and counted in its own bucket. It is never merged into a covered person, and never omitted from a total.
- Given any person line in a report, the raw identities that produced it are readable from the report itself, not inferred from elsewhere.
- The mapping is a person's own declaration. Nothing derives it from a git author, an email address, a hostname, or any identity attribute a tool exports on its own.
- Neither a repository nor a CI job can supply or alter the mapping a report resolves against. It is resolved from the machine user's own profile only, on every platform.
- Whether an identity is carried as a name or as a pseudonym is not decided here. The mapping keys on the opted-in identifier; any display name travels as an optional value the mapping neither requires nor produces.
- A person can read the full set of identities mapped to them from their own machine, with no report run and nobody else's involvement.
- Withdrawing the local identity keeps working while a mapping exists, and a withdrawal does not silently leave the mapping resolving records to a person who opted out.
- A damaged or unreadable mapping costs the resolution, never the figures: the report still counts every record, with every identity unresolved.
- Every stated behaviour is observable with no AI tool binary present.

## Non-goals

- Any hosted directory, account service, or network call that supplies or synchronises the mapping. The mapping's source is a separate choice.
- The cross-repository, multi-person team report that aggregates several machines' data after upload.
- Deciding whether measurement is pseudonymous or named, and amending the decision of record that governs it.
- Attaching a person to an export-provenance record. Person identity stays on the locally read route, as today.
- Any judgement about an individual. The report shows distribution, never performance.

## Done-when

- One human running two different tools on one machine appears as one person in a report, not two.
- One human running on two machines, having declared both identities, appears as one person in a report, not two.
- A report run over records carrying an identity nobody mapped shows that share separately, labelled unresolved, and the shares still account for every record.
- A person asking their own machine what it knows about them is shown every identity mapped to them, before any report exists.
- A report line naming a person also carries the raw identities behind it.
- A report run with no mapping declared, or with one that cannot be read back, still reports every record's figures, with the person breakdown showing everything unresolved and saying why.
- A mapping placed in a repository or set through a project-scoped setting has no effect on what a report resolves.

## Stakeholders

- Decider: the repository owner, for the pseudonym-versus-name question this spec deliberately does not answer.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person reading what their own work cost, and later a lead reading a team's.

## Context

- Source: #661, under milestone "Aggregate across tools and people". Parent #652, blocks #656.
- #661's own out-of-scope excludes any hosted directory integration, which places account connection and its authentication outside this contract.
- #661's sixth acceptance criterion defers the name-versus-pseudonym choice to the decision issue #660. This spec satisfies that by not choosing: the mapping is keyed on the identifier, and a display name is carried through untouched.
- Records already carry an optional person identifier and an optional display name, set only on the locally read route. Nothing today reconciles two identifiers belonging to one human.
- The local identity is minted once per machine and serves every tool on it, so the two-tools case is expected to already hold and is stated here as a condition to keep, not to build.
- The person axis on the local report belongs to this contract rather than to #656: #656 is the cross-repository report that depends on upload, redaction and a price table, none of which a single machine's report touches, and without a rendered person breakdown the resolution this spec defines would have no observable output at all.
- The governing rule this inherits, already in force on step attribution: an unknown is never a zero, and an attribution states its own strength.
