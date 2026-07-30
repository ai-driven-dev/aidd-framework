# 03 - Conclude

Write the investigation outcome and reconnect it to the backlog.

## Input

The spike, its evidence, outcome status, and follow-up authority.

## Output

A concluded spike with coherent parent links and any authorized backlog update.

## Process

1. **Write.** Complete the earned outcome and follow-up fields in [spike template](../assets/spike-template.md).
2. **Propose.** Show the outcome and exact parent or backlog changes.
3. **Sync.** Apply [persistence](../references/persistence.md).
4. **Continue.** When authorized, apply [capabilities](../references/capabilities.md) to the follow-up.

## Test

| Case | Observable |
| --- | --- |
| Outcome | Frontmatter status is lifecycle-valid and `Outcome` plus `Follow-up` are present |
| Parent update unauthorized | Parent and backlog content are unchanged |
| Parent update authorized | Exact reassessment changes exist; relations remain single-owned |
| Resolved parent | owner reassesses readiness and planning fields; no automatic completion |
