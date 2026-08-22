# 03 - Decide

Choose reuse or the smallest system change that satisfies a new interface need.

## Input

The evidence map and the explicit interface need in extend mode.

## Output

A system decision naming the need, reused surfaces, any required extension, evidence, affected states, rejected parallel conventions, and any potential stable convention.

## Process

1. **Match.** Search existing page patterns, composite components, primitives, tokens, and layout conventions in that order.
2. **Choose.** Select one outcome from the evidence.
   - An existing surface satisfies the need: return it unchanged.
   - A coherent gap remains: add the smallest variant, token, primitive, or convention that closes it.
   - No extension can express the need cleanly: propose a new surface and evidence the rejected options.
3. **Flag.** Identify a potential stable convention for a separate memory refresh.

## Test

| Case | Pass |
| --- | --- |
| Existing surface fits | no extension is proposed |
| Extension proposed | the unmet need, affected existing surface, and required states are named |
| New surface proposed | rejected reuse and extension options are evidenced |
| Existing breakpoint fits | no new breakpoint is introduced |
| Stable convention emerges | it is flagged and project memory remains unchanged |
