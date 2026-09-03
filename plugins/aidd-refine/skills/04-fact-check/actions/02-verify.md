# 02 - Verify

Run the cheapest-first verification cascade against each claim and give it a verdict.

## Input

- The tagged claims from `01-identify-claims`.

## Output

A list of verdicts: each claim gains one verdict (verified, refuted, conflict, or unverified) with the sources behind it and the tier that resolved it.

## Process

1. **Walk.** For each claim, walk the cascade in [verification-cascade.md](../references/verification-cascade.md): first project memory and docs, then codebase inspection, then web lookup.
2. **Route.** Send repo facts to memory and codebase first; send other claims to memory then the web.
3. **Short-circuit.** The first tier that resolves a claim sets its verdict. Do not consult later tiers.
4. **Guard.** Reach the web only after memory and codebase both fail. Prefer one authoritative source, and stop once resolved.
5. **Judge.** Give each claim one verdict: verified (record every source), refuted (a source contradicts the claim, record it), conflict (record both sides with their origin, pick no winner), or unverified (cascade exhausted, no source).
6. **Emit.** Return the verdict list.

## Test

- Run on `"the source file plugins/aidd-context/hooks/update_memory.js exists in this repo"`: the cascade resolves at the codebase tier, the verdict is verified, the source is that file path, and the web tier is never reached.
