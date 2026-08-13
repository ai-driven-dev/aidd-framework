# Verification cascade

Claims are verified cheapest-first. The cascade short-circuits: as soon as a tier resolves a claim, stop and skip the remaining tiers.

## Tiers

| Tier | Source                  | What it covers                                                        | Cost   |
| ---- | ----------------------- | --------------------------------------------------------------------- | ------ |
| 1    | Project memory and docs | In-repo memory files, context files, README, in-repo documentation    | free   |
| 2    | Codebase inspection     | Reading and searching the project's own source files                  | free   |
| 3    | Web lookup              | An external lookup against authoritative sources                      | metered |

## Short-circuit rule

For each claim, walk tiers in order. The first tier that produces a clear answer resolves the claim: record the verdict and the source, then move to the next claim. Never run a later tier once an earlier one has resolved.

## Tier routing by category

- `project-fact`: tier 1, then tier 2. A web lookup is almost never needed and must be skipped once tier 1 or 2 resolves.
- `version`, `api-signature`, `date-event-person`, `hard-to-know`: tier 1 first (a pinned version or doc may already answer it), then tier 3. Tier 2 only helps when the project itself embeds the fact.

## Web-cost guardrail

A web lookup is a last resort, never an opener.

- Reach tier 3 only when tiers 1 and 2 both failed to resolve the claim.
- Prefer one authoritative source (official documentation, the package registry, the primary publication) over many low-quality pages.
- Stop as soon as the claim is resolved or a contradiction is found; do not keep fetching for extra confirmation.

## Verdicts

Each verified claim ends in exactly one verdict:

- `verified`: one or more sources confirm the claim. Record every source.
- `refuted`: a source contradicts the claim. Record the contradicting source.
- `conflict`: sources disagree. Record both sides with their origin; do not pick a winner.
- `unverified`: no tier produced a source. The claim is kept and hedged, never asserted and never deleted.
