# The identity file is the person

## Target

One file on a machine holds who its user is and which identifiers are them, so that resolving a person needs one source of truth rather than two agreeing with each other.

## Hard constraints

- A person is described by exactly one file. Nothing else on the machine declares who someone is.
- That file can only ever describe the machine's own user. No shape in it can express a second person, so a declaration that two people claim one identifier cannot be written down at all.
- How an identity was obtained is recorded at the moment it is obtained, because that is the only moment it is knowable: created here, or taken from somewhere else. It is never inferred afterwards.
- A person can take an identity they already have onto another machine, without a second identity being created for them there.
- Taking an identity is a declaration the tool cannot check. Nothing may present it as though it had been verified.
- Withdrawing removes the whole declaration, including every identifier that was added to it, and says how many it removed.
- Resolution keeps its three outcomes, unchanged: an identifier that is this person, an identifier nobody placed, and no identifier at all. None of the three may collapse into another.
- A report that cannot use the declaration still reports every figure, and names which of the possible causes actually happened rather than stating a single reading for all of them.
- The file is resolved from the machine user's own profile only, on every platform. Neither a repository nor a CI job can supply or alter it.
- Whether an identity is carried as a name or as a pseudonym is still not decided here.
- Every stated behaviour is observable with no AI tool binary present.

## Non-goals

- The strength of a person attribution on a report row — whether a row is this reader or merely something they declared. That is its own contract.
- Any hosted account, authentication, or server-issued identity.
- Deciding whether an identity should be shared across machines by default, or minted per machine by default. This makes both possible; it does not choose.
- Migrating an existing separate declaration file. That shape was never released, so there is nothing in the world to migrate.
- Deriving an identity from an email address, a git author, or a hostname.

## Done-when

- One human working on two machines, having taken the same identity on both, appears as one person in a report, with nothing else declared anywhere.
- Asking a machine who its user is shows the identity, how it was obtained, and every identifier added to it.
- Taking an identity that is already this machine's is reported as already in effect, not as a second act.
- Withdrawing leaves no declaration behind, and states how many added identifiers went with it.
- A declaration placed where a repository or a CI job could set it has no effect.
- A report run against a declaration that cannot be used still reports every figure, and says which cause it hit.
- A record whose identifier nobody declared is counted separately from a record carrying no identifier at all, and neither is merged into the other.
- Nothing in the codebase can express two people claiming one identifier, so the failure that shape allowed cannot occur.

## Stakeholders

- Decider: the repository owner, for the pseudonym-versus-name question this still does not answer.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person reading what their own work cost, across the machines they work on.

## Context

- The separate declaration file was introduced days ago and justified by a constraint that no longer holds: its own source comment states that the identity file is a byte shape a plain-node plugin script writes and the CLI mirrors, so a CLI-only concern could not be folded into it. That script was deleted when identity moved to the CLI; the CLI is now the only writer. The justification was already stale when it was written.
- The separate file's shape carries a list of people. A file read from one machine user's own profile can only ever legitimately describe that one user, so that list is generality the design refuses to use, and it carries a whole failure mode — two people claiming one identifier — that only a hand-edited file can produce.
- Nothing has been released: the report envelope version that carries the person breakdown exists only on this branch, and the separate declaration file has never reached a user. This is the cheapest moment this change will ever have.
- The three-outcome resolution, the person breakdown, the report axis and the journeys proving them were built against a shape, not against a file, and are meant to survive this unchanged.
