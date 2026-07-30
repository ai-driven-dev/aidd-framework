# 02 - Review

Challenge whether the Task is distinct and actionable.

## Input

The Task draft and its evidence.

## Output

A reviewed Task and its next user decision.

## Process

1. **Compare.** Apply [persistence](../references/persistence.md) to find a match or duplicate.
2. **Assess.** Apply [Task quality](../references/task-quality.md) to type, outcome, scope, done conditions, and relations.
3. **State.** Apply [lifecycle](../references/lifecycle.md) without inferring readiness.
4. **Relate.** Keep only supported parent, source, dependency, and replacement relations.
5. **Decide.** Invite revision or finalization; offer a Spike when uncertainty blocks readiness.

## Test

| Case | Pass |
| --- | --- |
| Independent value | Story route; no Task proposed |
| Blocking uncertainty | Spike offered; unsupported solution absent |
| Standalone Task | explicit reason; no invented parent |
| Ready | every readiness criterion passes |
| Relation | valid owner and target; no mirrored inverse |
| Review | workspace unchanged |
