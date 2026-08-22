# 04 - Compose

Turn the structure into explicit interface decisions that fit the existing system.

## Input

The screen and state structure plus the evidence map.

## Output

An interface direction naming reused patterns and primitives, the smallest required extensions, and justified non-obvious decisions.

## Process

1. **Reuse.** Apply the reuse order in [evidence.md](../references/evidence.md) to each region and interaction.
2. **Extend.** Define the smallest system delta for a need the existing system cannot express.
3. **Decide.** Record each non-obvious choice as decision, evidence, consequence, and an optional rejected alternative.
4. **Express.** Describe visual behavior in system terms without source code, component markup, or CSS declarations.
5. **Separate.** Keep a visual choice feature-local unless an explicit requirement or repeated implementation already supports a stable convention; potential future reuse is not evidence and produces no memory candidate.

## Test

| Case | Pass |
| --- | --- |
| Existing primitive fits | it is named instead of a parallel primitive |
| Extension proposed | the unmet need and existing surface being extended are named |
| New convention proposed | it is separate from feature decisions and no memory file changes |
| Single-feature visual choice | it remains feature-local unless an explicit requirement standardizes it |
| Speculative future reuse | no stable convention or memory candidate is emitted |
| Explicit style direction | compatible structure is reused and the required visual delta is explicit |
| Final direction | it contains no production markup, CSS declaration, or framework recipe |
