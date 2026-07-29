# 02 - Discover

Build an evidence-aware understanding of the product opportunity.

## Input

The framed product, evidence path, and user feedback.

## Output

The current opportunity, audience, product bet, evidence, assumptions, and success direction.

## Process

1. **Inspect.** Read the selected available sources.
2. **Research.** Run only the selected external research.
3. **Choose.** Apply [techniques](../references/techniques.md) only to unresolved claims.
4. **Challenge.** Surface contradictions that could change the product.
5. **Probe.** Ask one question about the highest-impact gap and wait.
6. **Integrate.** Fold the answer into affected claims.
7. **Repeat.** Return to `Probe` while an unaccepted consequential gap remains.

## Test

| Case | Pass |
| --- | --- |
| Unsupported product claim | labeled assumption, never evidence or decision |
| Lens selected | matches the stated uncertainty in `techniques`; creates no artifact |
| Next question | exactly one unanswered, product-changing question; no answered question repeated |
| Consequential gap | no draft unless the user accepts it as an assumption |
