# 04 - Write

Write each approved lesson to the destination the user chose.

## Input

The learning plan approved by the user.

## Output

The created or updated files, and a summary table.

## Process

1. **Start.** Start from the approved learning packet.
2. **Route.** Apply only the destination path in [destinations](../references/destinations.md).
3. **Fill.** Load the destination asset when one is required, fill it from the packet, and strip its guidance comment.
4. **Review.** Apply [review protocol](../references/review-protocol.md) to every touched file or handoff.
5. **Report.** Report packet, destination, action, file or handoff, and review verdict.

## Test

| Case | Pass |
| --- | --- |
| A lesson is approved | it appears in the table, at the destination the user chose |
| A packet has no user approval | it is neither written nor handed off |
| The report is delivered | it carries a review verdict for every touched file and handoff |
