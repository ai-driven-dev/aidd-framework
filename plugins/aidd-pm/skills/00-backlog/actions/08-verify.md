# 08 - Verify

Prove structural and semantic coherence after authorized changes.

## Input

The applied identities and original event.

## Output

A coherent backlog or actionable findings routed for correction.

## Process

1. **Compare.** Verify every authorized mutation and reject any extra change.
2. **Prove.** Ask each owning capability to prove what it wrote: transitions, relations, and readiness.
3. **Route.** Return findings for correction; otherwise report the affected identities.

## Test

| Case | Pass |
| --- | --- |
| Broken artifact | its owning capability names the artifact and the reason |
| Semantic consequence | owning capability verifies it |
| Unsupported transition | owning capability rejects it; verification fails |
| Extra mutation | verification fails |
| Coherent result | every owner proves its own writes and every authorized mutation matches |
