# 03 - Conclude

Write the investigation outcome and reconnect it to the backlog.

## Input

The spike, its evidence, outcome status, and follow-up authority.

## Output

A concluded Spike with coherent parent links and any authorized backlog update. After a write, report the stable identity, changed fields as `before -> after`, affected relations, and the verification result. For a draft or no-write result, state that no persisted change occurred.

## Process

1. **Draft.** Complete the outcome and follow-up fields the evidence supports in [spike template](../assets/spike-template.md).
2. **Propose.** Show the outcome and exact parent or backlog changes.
3. **Authorize.** Confirm the outcome and each related write; otherwise return the proposal.
4. **Write.** Apply the authorized changes through their owning supports.
5. **Verify.** Read the affected graph back and report what changed.
6. **Continue.** When authorized, apply [capabilities](../references/capabilities.md) to the follow-up.

## Test

| Case | Pass |
| --- | --- |
| Outcome | frontmatter status is lifecycle-valid; `Outcome` and `Follow-up` present |
| Parent update unauthorized | parent and backlog content unchanged |
| Parent update authorized | exact reassessment changes exist; relations remain single-owned |
| Resolved parent | owner reassesses readiness and planning fields; no automatic completion |
