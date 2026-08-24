# 06 - Extend

Authorize the smallest shared change that satisfies a new UI need.

## Input

An active system contract, its implementation evidence, and an explicit unmet shared need.

## Output

A delta at [delta-path.md](../references/delta-path.md) with `mode: extend` and `base_revision` equal to the active revision.

## Process

1. **Match.** Search existing page patterns, composites, primitives, tokens, and layout conventions in that order.
   - When the current system closes the need, return reuse and stop.
2. **Prepare.** Render the smallest extension and any rejected parallel convention in memory.
3. **Lock.** Apply [mutation.md](../references/mutation.md) and recheck the active base under the lock.
4. **Draft.** Record target scope, expected sources, affected states, specialist fragments with exact provider names, acceptance conditions, and `status: draft` without implementation code.
5. **Finalize.** Set the delta lifecycle state.
   - Without exact authorization, keep `status: draft`.
   - With exact authorization, record the approval source and set `status: approved`.

## Test

| Case | Pass |
| --- | --- |
| Existing surface fits | no delta is written |
| Extension | unmet need, affected surface, and states are explicit |
| New primitive | failed reuse and extension options are evidenced |
| Concurrent change | the delta records the exact active base revision |
| Concurrent mutation | the write stops without replacing another writer's result |
