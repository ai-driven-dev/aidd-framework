# 08 - Verify

Prove structural and semantic coherence after authorized changes.

## Input

The applied identities and original event.

## Output

A coherent backlog or actionable findings routed for correction.

## Process

1. **Check.** Run [the backlog checker](../../../hooks/check-backlog.js) in JSON mode.
2. **Compare.** Verify every authorized mutation and reject any extra change.
3. **Review.** Ask owning capabilities to verify lifecycle and readiness consequences that metadata cannot prove.
4. **Route.** Return findings for correction; otherwise report the affected identities.

## Test

| Case | Pass |
| --- | --- |
| Structural error | checker code and artifact path returned |
| Semantic consequence | owning capability verifies it |
| Extra mutation | verification fails |
| Coherent result | checker exits zero and every authorized mutation matches |
