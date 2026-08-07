# 03 - Assess

Turn candidates into an approved learning plan.

## Input

Candidate learnings grounded in source evidence.

## Output

A learning plan approved by the user and ready to write.

## Process

1. Apply [assessment](../references/assessment.md), then use [destinations](../references/destinations.md) to propose where each candidate should land.
2. Score each candidate and reconcile existing coverage.
3. Show the scored recommendation and ask the user which packets to approve, edit, send to another destination, or skip.
4. Fill [learning packet](../assets/learning-packet.md) only for user-approved items.

## Test

| Case | Pass |
| --- | --- |
| A packet is approved | it carries score, approved destination, reconciliation, and user approval |
| An item is skipped or already covered | it is not written |
