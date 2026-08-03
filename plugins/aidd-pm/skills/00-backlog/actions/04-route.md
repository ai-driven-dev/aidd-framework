# 04 - Route

Delegate each proposed change to its owning capability.

## Input

The inspected scope and event.

## Output

One change set with no persisted change.

## Process

1. **Select.** Apply [events](../references/events.md) to choose the owning capability.
2. **Delegate.** Ask that capability for proposed content, status, relation, estimate, or order changes only. Delegation stops before the capability persists anything; `07-apply` calls it back to write.
3. **Collect.** Normalize every proposal with [change set](../references/change-set.md).
4. **Repeat.** Route impacted artifacts until the event has no unhandled consequence.

## Test

| Case | Pass |
| --- | --- |
| Known artifact event | exactly one owning capability per proposed field |
| Refinement | unchanged snapshot ready for `05-assess` |
| Blocking uncertainty | Spike proposed; parent completion is not inferred |
| Route | workspace unchanged; every consequence is represented once |
