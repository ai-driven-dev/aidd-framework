---
name: 04-fact-check
description: Verify factual claims in a text against authoritative sources and rewrite it with footnote citations, hedging the unconfirmed. Use to fact-check, verify a claim, or cite sources on request. Not for judging code or clarifying requirements.
argument-hint: text
---

# Fact-check

Verifies the factual claims inside a target text and rewrites it grounded in evidence. The skill extracts each verifiable claim, runs a cheapest-first verification cascade, and emits a rewritten answer where every confirmed claim carries a footnote citation and every unconfirmed claim is explicitly hedged. When sources disagree, both are reported rather than one being silently chosen.

## Actions

| #   | Action            | Role                                                                          | Input                       |
| --- | ----------------- | ----------------------------------------------------------------------------- | --------------------------- |
| 01  | `identify-claims` | Extract verifiable factual claims from the text, classify each, drop opinion  | target text                 |
| 02  | `verify`          | Run the verification cascade per claim, produce a verdict and sources         | claim list from 01          |
| 03  | `report`          | Rewrite the text with footnote citations, hedge unverified, surface conflicts | verdict list from 02        |

Run `01 → 02 → 03`; pass each `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Never alter the meaning of a claim while verifying it: verify what was stated, not a charitable reinterpretation.
- The verification cascade is cheapest-first and short-circuits: stop at the first tier that resolves a claim. See `references/verification-cascade.md`.
- A web lookup is the last resort, never the first. Reach it only when project memory and codebase inspection both fail to resolve a claim.
- Claim categories come from the locked set in `references/claim-categories.md`. Opinion, preference, and trivially-known statements are not claims and are skipped.
- When two sources disagree, report both with their origin, never silently pick one.
- An unverified claim is never deleted and never asserted as fact: it is kept and marked `(unverified - no source found)`.
- Caching a verified fact is opt-in: propose it with a recommendation, never cache silently. The skill persists nothing; the mechanics live in action 03.
- The final report is reader-facing prose: the corrected text, `## Sources`, and `## Unverified claims`, nothing else. Internal mechanics never appear in the output: no cascade or tier trace (`Cascade:`, `tier 1/2/3`, `miss`, `resolved`), no category labels, no raw verdict words. State conclusions, not the process. Action 03 holds the exhaustive forbidden list.
- The report is rendered in plain prose and is never restyled by an active output mode. The skill's output format is fixed by action 03 alone.

## References

- `references/claim-categories.md`: locked taxonomy of verifiable claim categories with definition and example.
- `references/verification-cascade.md`: the three-tier cascade, short-circuit rule, web-cost guardrail.

## Assets

- `assets/report-template.md`: rewritten-answer skeleton with the `## Sources` footnote block.
