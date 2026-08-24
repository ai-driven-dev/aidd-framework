# 07 - Retire

Authorize removal of an active UI system from scope resolution.

## Input

An active system contract and explicit retirement intent.

## Output

A delta at [delta-path.md](../references/delta-path.md) with `mode: retire`, the active base, dependencies, and migration acceptance.

## Process

1. **Lock.** Apply [mutation.md](../references/mutation.md) and recheck the active base under the lock.
2. **Confirm.** Require explicit intent to remove or replace the system.
   - Treat absent usage as evidence, not authorization.
3. **Trace.** Find UI contracts, active deltas, and implementation sources that still reference the system.
4. **Plan.** List active consumers as migration dependencies that block verification but not approval.
5. **Resolve.** Classify the migration outcome.
   - While the outcome is ambiguous, keep the delta draft.
   - When the authorized outcome is decommissioning, do not require a replacement.
6. **Finalize.** Record the exact authorized retirement without deleting contract history.

## Test

| Case | Pass |
| --- | --- |
| Active consumers | an approved delta may name them as required migration work |
| Consumers remain | the delta cannot become verified |
| Approved replacement | the replacement id and migration conditions are present |
| No replacement | explicit decommissioning and consumer removal make the outcome complete |
| Delta written | it contains migration acceptance without changing the contract |
| Concurrent mutation | the write stops without replacing another writer's result |
