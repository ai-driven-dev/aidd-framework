# 04 - Write

Write each approved lesson to the destination the user chose.

## Input

The learning plan approved by the user.

## Output

The created or updated files, and a summary table.

## Process

1. **Start.** Start from each approved learning packet.
2. **Route.** Apply the destination and reconciliation rules in [destinations](../references/destinations.md).
3. **Fill.** Load the destination asset when one is required and follow its instructions.
   - For a retraction, remove the entry instead of filling one.
4. **Review.** Apply [review protocol](../references/review-protocol.md) to every touched file or handoff.
5. **Report.** Fill [write report](../assets/write-report.md) grouped by destination.

## Test

| Case | Pass |
| --- | --- |
| A lesson is approved | it appears in the table, at the destination the user chose |
| A packet has no user approval | it is neither written nor handed off |
| The report is delivered | it carries a review verdict for every touched file and handoff |
| A candidate retracts existing content | the entry is removed, not left in place with a note |
