# 02 - Reconcile

Reconcile independent product, delivery, and quality assessments.

## Input

Exactly three reports, one per role, for the same Epic or Story snapshot.

## Output

One refinement result with a verdict, findings, conflicts, amendments, and questions.

## Process

1. **Validate.** Reject missing, duplicate-role, unevidenced, or different-snapshot reports.
2. **Merge.** Apply [reconciliation](../references/reconciliation.md).
3. **Trace.** Link every amendment and question to its source finding.
4. **Return.** Return the result with its unresolved questions.

## Test

| Case | Pass |
| --- | --- |
| Missing or duplicate role | no result; invalid roles identified |
| Different snapshot | no result; target or revision mismatch identified |
| Duplicate finding | one finding retains every role and evidence pointer |
| Conflict | both positions preserved; one open question; no winner inferred |
| Amendment | proposed only when evidence or an explicit decision determines it |
| Verdict | follows the unresolved content |
| Approval | never inferred or requested on unresolved conflicts |
| Side effect | workspace and external systems unchanged |
