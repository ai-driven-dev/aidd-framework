# 07 - Apply

Delegate only the authorized mutations.

## Input

The frozen authorized change set.

## Output

Created or updated artifact identities.

## Process

1. **Group.** Group mutations by owning capability without changing their order.
2. **Delegate.** Pass each capability only its authorized mutations and evidence.
3. **Record.** Collect each created or updated identity.
4. **Stop.** On any rejected or failed mutation, preserve completed work and return the unresolved entry.

## Test

| Case | Pass |
| --- | --- |
| Mutation | applied by its owning capability, never by Backlog |
| Scope | no artifact or field outside the authorized change set changes |
| Failure | unresolved mutation returned; no silent skip |
| Result | exactly one identity per authorized create or update |
