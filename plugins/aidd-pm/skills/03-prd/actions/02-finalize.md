# 02 - Finalize

Save the approved PRD.

## Input

One approved PRD draft.

## Output

The saved PRD, or no change if not written.

## Process

1. **Save.** Write to `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`, creating the month directory when missing.
2. **Verify.** Read the saved PRD back and report what changed.

## Test

| Case | Pass |
| --- | --- |
| Save succeeds | the PRD file exists on disk |
| Save reported | identity and verification result |
| No write happened | the result states that no persisted change occurred |
