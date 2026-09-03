# 08 - Verify

Prove the applied change holds, through the owners that wrote it.

## Input

The change receipts and original event.

## Output

A coherent backlog or actionable findings routed for correction.

## Process

1. **Compare.** Match each receipt to its authorized mutation and reject any extra change.
2. **Prove.** Ask each owning capability to prove what it wrote: transitions, relations, and readiness.
3. **Route.** Return findings for correction; otherwise report the affected identities.

## Test

| Case | Pass |
| --- | --- |
| Broken artifact | its owner names the artifact and the reason |
| Unsupported transition | its owner rejects it; verification fails |
| Extra mutation | absent from the authorized receipts; verification fails |
| Coherent result | every owner proves its own writes and every authorized mutation matches |
