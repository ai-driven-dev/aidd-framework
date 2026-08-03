# 02 - Review

Challenge whether the Task is distinct and actionable.

## Input

The Task draft and its evidence.

## Output

A reviewed Task and its next user decision.

## Process

1. **Compare.** Apply [persistence](../references/persistence.md) to find a match or duplicate.
2. **Assess.** Apply [readiness](../references/readiness.md).
3. **State.** Apply [lifecycle](../references/lifecycle.md) without inferring readiness.
4. **Relate.** Apply [relations](../references/relations.md).
5. **Decide.** Invite revision or finalization, or apply [handoffs](../references/handoffs.md).

## Test

| Case | Pass |
| --- | --- |
| Different work type | no Task proposed; the offered capability is named |
| Standalone Task | explicit reason; no invented parent |
| Ready | every readiness criterion passes |
| Relation | valid owner and target; no mirrored inverse |
| Review | workspace unchanged |
