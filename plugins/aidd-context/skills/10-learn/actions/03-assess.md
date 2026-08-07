# 03 - Assess

Turn candidates into an approved learning plan.

## Input

Candidate learnings grounded in source evidence.

## Output

A learning plan approved by the user and ready to write.

## Process

1. **Frame.** Apply [assessment](../references/assessment.md), then use [destinations](../references/destinations.md) to propose where each candidate should land.
2. **Score.** Score each candidate and reconcile existing coverage.
3. **Confirm.** Show the scored recommendation and ask which packets to approve, edit, redirect, or skip.
4. **Fill.** Fill [learning packet](../assets/learning-packet.md) for approved items only.

## Test

| Case | Pass |
| --- | --- |
| A packet is approved | it carries score, approved destination, reconciliation, and user approval |
| An item is skipped or already covered | it is not written |
