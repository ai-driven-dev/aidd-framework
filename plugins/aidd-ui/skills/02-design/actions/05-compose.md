# 05 - Compose

Turn the feature structure into explicit experience decisions.

## Input

The structure, evidence map, active UI system, and specialist fragments.

## Output

Feature-local interface decisions, reused system surfaces, and required system-delta references.

## Process

1. **Reuse.** Apply the reuse order in [evidence.md](../references/evidence.md) to every region and interaction.
2. **Decide.** Record material feature choices with evidence and consequence.
   - Include a rejected alternative only when it explains the decision.
3. **Source.** Reuse existing assets by path or record only the role, constraints, and acceptance required for a missing asset.
4. **Express.** Specify only evidenced interface copy, hierarchy, visual emphasis, density, alignment, feedback, and motion that implementation must preserve.
5. **Depend.** Reference an existing delta or leave the shared gap unresolved.
6. **Compare.** Apply the selected contract mode.
   - In `revise` mode, record preserved and changed decisions against the prior contract.
   - In `create` mode, record no superseded contract.
7. **Bound.** Use system vocabulary without component code, CSS, or framework recipes.

## Test

| Case | Pass |
| --- | --- |
| Existing surface fits | it is named at its exact contract revision |
| Shared gap | a system-delta path is referenced, not duplicated |
| Feature choice | it remains local to this contract |
| Interface copy | it traces to intent or system evidence and preserves factual meaning |
| Feature motion | trigger and feedback role are explicit while the applicable accessibility fragment is preserved |
| Existing asset | its project path and role are named |
| Missing asset | role, constraints, and acceptance are explicit without producing a binary |
| Inapplicable expression | no empty checklist or speculative decision is added |
| Revise mode | preserved and changed decisions are explicit |
| Final direction | it contains no production implementation |
