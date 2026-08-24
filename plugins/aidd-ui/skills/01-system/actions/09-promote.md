# 09 - Promote

Merge one verified delta into its UI system contract.

## Input

A specific verified system delta and its active base contract when one exists.

## Output

The updated active or retired system contract and the same delta marked `promoted`.

## Process

1. **Lock.** Apply [mutation.md](../references/mutation.md).
2. **Recheck.** Validate the delta and current contract under the lock against [lifecycle.md](../references/lifecycle.md).
   - For `establish`, require no current contract with the id and no equal or unorderable active scope overlap.
   - For `extend`, require every verified source to prove the change against the active base.
   - For `retire`, require migrated consumers and disconnected old sources.
   - When retirement declares a replacement, require its implementation sources to resolve.
   - Do not require an active replacement contract.
3. **Render.** Prepare the complete contract, archive, and promoted delta bodies in memory.
   - Establishment creates revision `1` from target scope and verified sources without an archive or history directory.
   - Extension archives and increments the active contract.
   - Retirement archives and increments the contract to `retired` while retaining historical source paths.
4. **Write.** Replace the contract and delta with the ordered, recoverable writes in [mutation.md](../references/mutation.md).
5. **Read back.** Confirm the archive, contract revision, and promoted delta before releasing the lock.
6. **Signal.** Report stable-memory drift for a separate refresh.

## Test

| Case | Pass |
| --- | --- |
| Verified delta | contract advances exactly one revision |
| Unresolvable commit or source | promotion fails without mutation |
| Stale base | promotion fails without mutation |
| Interrupted write | an exact retry completes promotion and any mismatched state stops for reconciliation |
| Concurrent promotion | the loser stops without replacing another writer's files |
| Stale lock | promotion stops and reports the lock without guessing ownership |
| Retired id establishment | promotion stops without replacing the retired head |
| Retired different id | its former scope permits establishment of a new id |
| First revision | establishment creates no empty history directory |
| Retirement | history remains and status becomes retired |
| Retired source removed | absence may satisfy retirement verification and the historical path remains in the contract |
| Pinned old revision | it resolves from the immutable history file |
