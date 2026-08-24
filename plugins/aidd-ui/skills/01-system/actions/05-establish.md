# 05 - Establish

Authorize the minimum shared system required when no coherent system exists.

## Input

An explicit shared UI need and an evidence map with no current contract for the proposed id or ambiguous active scope.

## Output

A delta at [delta-path.md](../references/delta-path.md), filled from [system-delta.md](../assets/system-delta.md) with `mode: establish` and `base_revision: null`.

## Process

1. **Lock.** Apply [mutation.md](../references/mutation.md) and rebuild the scope evidence under the lock.
   - Stop when a current contract has the proposed id or an active contract has an equal or unorderable scope overlap.
2. **Bound.** Include only conventions required by the stated work.
   - Do not create a full token taxonomy or component catalog.
3. **Reuse.** Preserve evidenced local values and patterns before proposing new foundations.
4. **Draft.** Write the delta with normalized scope, expected sources, specialist fragments, acceptance, constraints, and unresolved items.
5. **Finalize.** Set the delta lifecycle state.
   - Without exact authorization, keep `status: draft`.
   - With exact authorization, record the approval source and set `status: approved`.

## Test

| Case | Pass |
| --- | --- |
| No system | every proposed convention cites a requirement and no unrequested foundation category appears |
| Retired id exists | establishment stops without overwriting it |
| Retired different id | its former scope does not block a new system id |
| Nested active scope | a strict child or parent scope remains resolvable by specificity |
| Missing specialist decision | the delta stays draft with an unresolved item |
| Approval | the exact reviewed delta becomes approved |
| Concurrent mutation | the write stops without replacing another writer's result |
| Multiple systems | each change has a distinct system and delta filename |
| First system | the exclusive lock works before the systems directory exists |
| No implementation | no application source or active contract is created |
