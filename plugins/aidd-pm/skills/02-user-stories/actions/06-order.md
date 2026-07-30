# 06 - Order

Order competing Stories without inventing priority.

## Input

The assessed Stories and available product evidence.

## Output

An approved relative order.

## Process

1. **Compare.** Apply [ordering](../references/ordering.md) using supported value, urgency, learning, risk, and dependency signals.
2. **Sequence.** Apply [relations](../references/relations.md) to predecessors and blockers.
3. **Explain.** State the evidence behind each proposed position and every tradeoff.
4. **Decide.** Let the user change or approve the order.
5. **Record.** Store only the approved relative order.

## Test

| Case | Pass |
| --- | --- |
| No competition | action skipped; no order field added |
| Ordered set | each Story has one unique position backed by a source signal or relation |
| Blocker | blocker precedes the item it unblocks |
| Unsupported signal | no score, priority, or ordering weight added |
