# 02 - Review

Challenge whether the Epic is distinct, coherent, and ready for its next state.

## Input

The Epic draft.

## Output

A reviewed Epic and its next user decision.

## Process

1. **Compare.** Apply [persistence](../references/persistence.md) to find an existing match, overlap, or contradiction.
2. **Assess.** Apply [readiness](../references/readiness.md) to the complete draft.
3. **Challenge.** Test every claim against its source.
4. **Route.** Let the user choose revision, finalization, or [handoffs](../references/handoffs.md).
5. **Render.** Show a revised Epic or blocking finding; otherwise continue.

## Test

| Case | Pass |
| --- | --- |
| Quality gap | failed criterion maps to sourced evidence or one named gap |
| Existing match | update or reuse selected; identity preserved; no self-relation |
| Blocking uncertainty | no inferred claim; the capability handoffs names is offered |
| Review | no write |
| User output | no action, check, route, or unchanged-state label; a blocker ends with one open question |
