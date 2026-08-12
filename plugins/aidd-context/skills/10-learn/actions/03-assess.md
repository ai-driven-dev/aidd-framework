# 03 - Assess

Turn candidates into an approved learning plan.

## Input

Candidate learnings grounded in source evidence.

## Output

A learning plan approved by the user and ready to write.

## Process

1. **Score.** Apply [assessment](../references/assessment.md) and [destinations](../references/destinations.md): reason internally to a 0-10 score, reconcile existing coverage, and propose where it lands.
2. **Show.** State the source in one line, then fill and show the [recommendation table](../assets/recommendation-table.md).
3. **Confirm.** Ask, per packet: approve, modify, or skip.
   - When every packet is covered, skip the question.
4. **Fill.** Fill [learning packet](../assets/learning-packet.md) for approved items only.

## Test

| Case | Pass |
| --- | --- |
| A packet is approved | it carries score, approved destination, reconciliation, and user approval |
| An item is skipped or already covered | it is not written |
| The confirm step runs | only the source line and the table appear before it |
| The confirm question is asked | it names approve, modify, and skip |
| Every candidate is covered | the run ends, nothing is asked |
