# 08 - Reconcile

Classify differences among contracts, deltas, implementation, and memory.

## Input

The evidence map, active contract when present, and relevant system deltas.

## Output

A reconciliation result classifying each difference, plus an authorized delta status transition when proven.

## Process

1. **Classify.** Assign each difference one class from [authority.md](../references/authority.md).
   - When a delta status may change, apply [mutation.md](../references/mutation.md) and reclassify under the lock.
2. **Transition.** Apply only a transition allowed by [lifecycle.md](../references/lifecycle.md).
   - Mark a stale-base delta `superseded` without rebasing it.
   - Mark an exact draft or approved delta `rejected` only from explicit authorization.
   - Mark an approved delta `verified` only when every acceptance condition resolves at one implementation commit.
3. **Record.** Store the commit, verified sources, and evidence for verification.
   - Leave the delta approved when required runtime proof is unavailable.
4. **Preserve.** Surface unauthorized code drift without choosing a winner.
5. **Stop.** Promotion and memory refresh are separate explicit operations.

## Test

| Case | Pass |
| --- | --- |
| Approved, code unchanged | classified as pending, not drift |
| Code matches delta | delta becomes verified with evidence |
| Runtime unavailable | delta remains approved |
| Stale base | delta becomes superseded without contract mutation |
| Explicit rejection | the exact draft or approved delta becomes rejected |
| Concurrent mutation | status transition stops without replacing another writer's result |
