# 04 - Route

Delegate each proposed change to its owning capability.

## Input

The inspected scope and event.

## Output

One change set with no persisted change.

## Process

1. **Select.** Apply [events](../references/events.md) to choose the owning capability.
2. **Delegate.** Ask that capability for proposed content, status, relation, estimate, or order changes only.
3. **Collect.** Normalize every proposal with [change set](../references/change-set.md).
4. **Repeat.** Route impacted artifacts until the event has no unhandled consequence.
5. **Assess.** Continue to `05-assess` only for refinement or readiness.

## Test

| Case | Pass |
| --- | --- |
| Known artifact event | exactly one owning capability per proposed field |
| Refinement | unchanged snapshot ready for `05-assess` |
| Delivery work | Task owner proposes the change |
| Blocking uncertainty | Spike proposed; parent completion is not inferred |
| Observed mismatch | Defect owner proposes the change |
| Route | workspace unchanged; every consequence is represented once |
