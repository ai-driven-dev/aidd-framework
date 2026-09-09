# Measurement may reach a hosted destination, and the destination is never ours to fix

- Date: 2026-08-31
- Status: Accepted — supersedes one of the two decisions of record in #297, reaffirms the other
- Decided by: Baptiste LAFOURCADE (@blafourcade)

## Context

Issue #297 carries two decisions of record, verbatim:

> - **Standard:** OpenTelemetry (spans, metrics, logs). Sink is an OTel collector. No SaaS.
> - **Privacy:** explicit opt-in, anonymised ids, never code or prompt content.

Both were written before anything was built. Measured against what now ships, they have diverged in opposite directions.

**The privacy clause is honoured, and exceeded.** Measurement is off until a project switches it on; the identifier a person attaches is a random value they opt into and is never derived from a git author, an address or a hostname; no code, prompt or diff reaches storage, verified against every stored record on the machine that built this. Beyond what #297 asked: a person can refuse in their own environment, and that refusal wins over whatever a repository's committed file says.

**The standard clause is contradicted on all three of its statements.** The sink is a directory of JSON Lines written by `aidd telemetry read`, not an OTel collector. OpenTelemetry is not the route: an OTLP receiver existed, produced no record on the machine that built it across 34 stored records, and was deleted along with the only path that ever sent an address off the machine. And a hosted product — Le Gouvernail — is being built, which "No SaaS" forbids outright.

Issue #660 was opened to resolve this. Its body quotes only the privacy clause, and every one of its completion conditions speaks only to privacy, so it could close with the standard clause left standing and contradicted. It also failed once as a gate: #661 shipped while #660 was open, and nothing stopped it.

## Decision

**The privacy clause stands, unchanged**, and this record reaffirms it. Nothing below relaxes it: a hosted destination changes where measurement may go, never what measurement may contain.

**The standard clause is superseded.** In its place:

1. **There is no single standard transport.** The shipped route reads the files each AI tool already wrote. OpenTelemetry is one shape a destination may speak, not the framework's own.
2. **The local store is the sink.** A directory of JSON Lines under the person's own profile, whose contract is published in `aidd_docs/product/metrics-contract.md`.
3. **Measurement may reach a hosted destination.** "No SaaS" no longer holds.

4. **The framework exposes; the destination analyses.** Aggregating across people and repositories, saved views, filters and anything pushed to someone belong to a hosted destination. What runs on a machine stays deliberately light: it records, it exposes a documented record, and it answers a small number of direct questions through its skills. This is a boundary, not a staging order — local does not grow into an analytics product while waiting for one.

5. **A person sees their own measurement first, and that is structural while it stays local.** What was measured about someone is read from their own machine, from their own profile, by them. There is no earlier reader, because nothing is sent anywhere — the ordering is not enforced, it is a consequence of where the data lives. A person can also see exactly what is stored, and remove it, without asking anyone.

   **This stops being automatic the day a destination exists**, and that is the destination's obligation to carry, not something the framework can promise on its behalf: whatever a lead can read about a person, that person can read about themselves at least as early, and can find out what was sent. A destination that cannot say this of itself is not one this framework should be pointed at.

**And the constraint that makes the third and fourth clauses safe: the destination is never ours to fix.** A hosted destination is *a* destination, never *the* destination. Concretely, and each of these is testable:

- The destination is named by the person, in configuration. No host is compiled in, defaulted to, or preferred.
- What travels is the published record contract, not a payload shaped for one vendor. A second destination reading the same document gets the same data.
- A person can run their own destination and reach the same result as a paid one, with no capability withheld.
- Nothing about measuring or reading requires an account. Sending is a further, separate opt-in, on top of the one that allows measurement at all.
- Authentication belongs to the destination, and its absence is not a degraded mode.

## Alternatives

- **Keep "No SaaS" and honour it.** Coherent, and it would make #655, #662 and #656 unbuildable — every one of them requires leaving the machine. The hosted product would then have to fork or re-implement the framework, which is the outcome a decision of record exists to prevent, not to cause.
- **Supersede it by blessing Le Gouvernail.** Simpler to write and to build against. It makes the framework a client of one product, and every person who wants their own destination a second-class case. Rejected: the framework's value is that it measures your work for you, not that it feeds someone's service.
- **Leave #297 as it is and build anyway.** What is happening today. It costs nothing until the first person reads the decision and finds it false, at which point every other decision in this repository is worth less.

## Consequences

- **#660 can close against both clauses**, not one. Its body should be corrected first, or it will close having answered half the question.
- **#653, #655 and #662 describe a route that no longer exists.** All three argue from the OTLP export path deleted on this branch. They need rewriting together, not patching one by one — and the upload they describe is now a *new* thing to build, not a restoration of what was removed.
- **`aidd telemetry connect` gets a specification it can be written against**: authenticate to a destination the person names, and bind this machine's identity to an account there. Until now it had a purpose but no boundary.
- **The deletion is not reversed.** Nothing here restores a listener or an export writer. What ships today opens no port and sends nothing; a destination is the next thing to build, deliberately, with its own consent.
- **An amount in currency still has no route.** That is #654's price table, unaffected either way by this decision.
- **The local report is already past "light", and this record says so rather than pretending otherwise.** It carried seven axes when this decision was written; read `ARTEFACT_AXES` in `cli/src/presentation/display/cost-report-artefact.ts` for the current list rather than a count here, which only decays as the surface grows. Nothing here requires removing any of them; what it does require is that growth stops happening for free. A new axis needs an argument for why a machine must answer that question, not merely that it could.
- **#720's task axis already shipped** (`task` is in `ARTEFACT_AXES` today, alongside others this record did not anticipate — `agent`, `prompt`, `backlog`, `flow`). Under clause 4 that is a destination's question unless someone can say why a single machine must answer it. This record's caution did not gate that landing; reconciling the two is for whichever issue re-litigates this boundary, not a silent rewrite here.
- **#656 lands squarely on the destination side.** Per person, per team, per epic, across repositories — that is the analysis this boundary assigns to a hosted destination, and it should be re-scoped there rather than pursued as local work.
- **What the framework owes in exchange is a clean exposure.** The record contract, the sink's shape and their versioning stop being internal documentation and become the interface a destination is written against. They now deserve the care an API gets.
- **This record is the amendment #297 needs.** Both issues should reference it rather than continuing to state the superseded text.
