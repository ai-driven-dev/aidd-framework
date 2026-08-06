# 01 - Capture

Frame one observed mismatch as a Defect report.

## Input

A report, evidence, existing Defect, or current context.

## Output

One Defect draft or one clarification question.

## Process

1. **Resolve.** Inspect the supplied source, relevant artifacts, and matching Defects.
2. **Qualify.** Apply [qualification](../references/qualification.md). On mismatch, apply [handoffs](../references/handoffs.md).
3. **Clarify.** Ask one question only when expected behavior, actual behavior, or impact cannot be resolved.
4. **Draft.** Fill the [Defect template](../assets/defect-template.md) sections the source supports; leave the rest out.
5. **Feedback.** Show the complete report and fold corrections.

## Test

| Case | Pass |
| --- | --- |
| Unclear mismatch | no draft; one question that can determine the work type |
| Different work type | no draft; the offered capability returned |
| Existing match | existing identity returned; no duplicate draft |
| Report | `type: defect`, `status: reported`, title, expected, actual, and impact present |
| Evidence gap | unsupported evidence or reproduction omitted |
| Capture | workspace unchanged |
