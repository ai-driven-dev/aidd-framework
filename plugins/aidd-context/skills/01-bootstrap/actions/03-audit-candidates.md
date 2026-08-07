# 03 - Audit candidates

Audit each candidate in parallel to validate the proposed stack: tech compatibility, ecosystem maturity, known gotchas. Returns a verdict (✅ / ⚠️ / ❌) and a three-bullet rationale per candidate.

## Input

The comparison table from action 02, and the filled checklist from action 01 for context.

## Output

The action 02 table augmented with a verdict column, plus a three-bullet rationale block per candidate.

## Process

1. **Audit.** For each candidate row, spawn a parallel `general-purpose` agent with this brief:

   ```text
   Audit the following candidate stack for a SaaS project. Validate three dimensions:
   1. Tech compatibility: do the components integrate cleanly? Any deprecated combos?
   2. Ecosystem maturity: are the components stable (≥ 2 years prod-tested) and well-documented?
   3. Known gotchas: search recent (last 12 months) issues, blog posts, and discussions for blockers.

   Project context: <paste filled checklist blocks 1 to 3>
   Candidate: <paste candidate row from comparison table>

   Return:
   - Verdict: ✅ (no blocker) / ⚠️ (minor concerns) / ❌ (deal-breaker)
   - Three bullets justifying the verdict, concrete, citing specific tech facts, one of them stating whether the proposed monthly cost is realistic
   ```

2. **Aggregate.** Wait for every agent to return, then aggregate the verdicts into the table.
3. **Gate.** When every candidate returns ❌, print the verdicts, surface the common blocker, and loop back to action 02, or to 01 when the needs themselves are the blocker, with explicit guidance. Do not proceed to action 04.
4. **Pass.** When at least one candidate is ✅ or ⚠️, print the augmented table and per-candidate rationale, then pass control to action 04.

## Test

- Each candidate row has a verdict in `{✅, ⚠️, ❌}` and a rationale block of exactly three bullets.
- When every verdict is ❌, the flow does not advance to action 04 and prints guidance back to action 02.
