# 03 - Conclude

Write the investigation outcome and reconnect it to the backlog.

## Input

The spike, its evidence, and the outcome status.

## Output

A concluded spike with coherent parent links and any approved backlog update.

## Process

1. **Write.** Complete the earned outcome and follow-up fields in [spike template](../assets/spike-template.md).
2. **Propose.** Show the outcome and exact parent or backlog changes.
3. **Sync.** Apply [persistence](../references/persistence.md).
4. **Continue.** Only if the user asks, apply [capabilities](../references/capabilities.md) to the approved follow-up.

## Test

| Case | Observable |
| --- | --- |
| Outcome | Status is lifecycle-valid and `Outcome` plus `Follow-up` are present |
| Parent update not approved | Parent and backlog content are unchanged |
| Parent update approved | Exact changes and reciprocal links exist; only approved artifacts change |
