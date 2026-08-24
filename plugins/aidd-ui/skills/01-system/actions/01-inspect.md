# 01 - Inspect

Resolve the target UI system, its scope, and the evidence needed by the requested operation.

## Input

The project root, target workspace or surface, and system request.

## Output

An evidence map covering matching contracts and deltas, current implementation, project memory, external design documents, conflicts, and missing proof.

## Process

1. **Scope.** Resolve zero or one matching current contract with [scope.md](../references/scope.md).
2. **Read.** Inspect the matched contract and deltas, then canonical token, theme, style, component, pattern, breakpoint, and asset sources in the target workspace.
3. **Compare.** Apply [authority.md](../references/authority.md) to project memory and external design documents.
4. **Classify.** Separate evidenced shared conventions, feature choices, conflicts, and gaps.
   - When no evidence exists and creation was not requested, report the boundary and stop.

## Test

| Case | Pass |
| --- | --- |
| Monorepo | the target resolves zero or one active contract |
| Contract conflict | both sources remain visible and neither wins silently |
| Missing memory | inspection completes from contracts and repository evidence |
| Backend only | no UI artifact is proposed without an explicit creation request |
