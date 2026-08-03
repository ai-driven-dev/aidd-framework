# 01 - Frame

Define one bounded delivery Task.

## Input

A request, parent artifact, existing Task, or current context.

## Output

One Task draft or one clarification question.

## Process

1. **Resolve.** Inspect the source, relevant artifacts, and matching Tasks.
2. **Qualify.** Apply [qualification](../references/qualification.md). On mismatch, apply [handoffs](../references/handoffs.md).
3. **Clarify.** Ask one question at a time while outcome, scope, completion evidence, or ownership remains blocking.
4. **Draft.** Fill the [Task template](../assets/task-template.md) sections the source supports; leave the rest out.
5. **Feedback.** Show the complete draft and fold corrections.

## Test

| Case | Pass |
| --- | --- |
| No work identified | no draft; one open outcome question |
| Different work type | no Task draft; the offered capability returned |
| Existing match | existing identity returned; no duplicate draft |
| Draft | `type: task`, `status: proposed`, outcome, scope, and done conditions present |
| Optional metadata | absent unless known and project-supported |
| Frame | workspace unchanged |
