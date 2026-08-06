# 02 - Assess

Determine whether the Defect is actionable.

## Input

The Defect draft and available evidence.

## Output

A readiness finding and proposed lifecycle state.

## Process

1. **Compare.** Apply [persistence](../references/persistence.md) to detect a match or duplicate.
2. **Assess.** Apply [readiness](../references/readiness.md).
3. **State.** Apply [lifecycle](../references/lifecycle.md) without inferring confirmation.
4. **Relate.** Apply [relations](../references/relations.md).
5. **Decide.** Invite correction or approval of the finding in one open question.

## Test

| Case | Pass |
| --- | --- |
| Unconfirmed | remains `reported`; missing evidence named |
| Actionable | `ready` only when every readiness criterion passes |
| Duplicate | existing identity proposed; no new Defect |
| Relation | stored once on its owner; none invented |
| Assess | workspace unchanged |
