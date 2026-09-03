# 07 - Apply

Delegate only the authorized mutations.

## Input

The frozen authorized change set.

## Output

Change receipts from the artifact owners.

## Process

1. **Group.** Group mutations by owning capability without changing their order.
2. **Delegate.** Call each capability's own persist action with its authorized mutations, the evidence, and the authority already granted, so it writes, reports, and offers its next step without re-asking approval.
3. **Record.** Collect each stable identity, `before -> after` delta, affected relations, and verification result.
4. **Stop.** On any rejected or failed mutation, preserve completed work and return the unresolved entry.

## Test

| Case | Pass |
| --- | --- |
| Mutation | applied by its owning capability, never by Backlog |
| Scope | no artifact or field outside the authorized change set changes |
| Failure | unresolved mutation returned; no silent skip |
| Partial graph | incoherence between two mutations is not treated as a failure |
| Result | exactly one receipt per authorized create or update |
| Re-ask | the capability's own approval question never appears; decide's authority already covers it |
| Next step | the capability's own next-step offer reaches the user before the run ends |
