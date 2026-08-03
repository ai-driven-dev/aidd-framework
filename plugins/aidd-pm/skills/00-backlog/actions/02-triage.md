# 02 - Triage

Classify intake before proposing backlog changes.

## Input

The inspected request, source, and read model.

## Output

One existing identity, artifact route, or out-of-backlog handoff.

## Process

1. **Classify.** Apply [intake](../references/intake.md) to the observed need.
2. **Compare.** Search the read model for the same outcome, behavior, uncertainty, or mismatch, and name the supports it covers.
3. **Select.** Reuse existing work or choose one owning artifact capability.
4. **Clarify.** Ask one question and wait only when the classification can change the route.

## Test

| Case | Pass |
| --- | --- |
| Existing work | one existing identity selected; no duplicate proposed |
| Unread support | comparison scope stated; no duplicate ruled out beyond it |
| Classified need | the route intake names, and only that one |
| Incident | out-of-backlog handoff; no artifact proposed |
| Triage | workspace unchanged; one justified route |
