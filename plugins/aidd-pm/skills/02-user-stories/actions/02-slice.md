# 02 - Slice

Find the smallest useful vertical slices within the confirmed scope.

## Input

The confirmed Story scope.

## Output

An approved candidate list with value and known relations.

## Process

1. **Slice.** Apply [slicing](../references/slicing.md) to the user outcome.
2. **Relate.** Apply [relations](../references/relations.md) to known parents, dependencies, and blockers.
3. **Classify.** Remove or reclassify technical layers, broad outcomes, and unresolved questions.
4. **Confirm.** Ask only when alternative slices change delivered value; otherwise continue.

## Test

| Case | Pass |
| --- | --- |
| Candidate | names one observable user or stakeholder outcome |
| Wrong slice | technical layer, broad outcome, or learning-only item is reclassified |
| Relations | every supported known relation is present; none is invented |
| Completed source | no dependency unless it blocks delivery |
| Alternative slices | no Story draft until the user chooses |
