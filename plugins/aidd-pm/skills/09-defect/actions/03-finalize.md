# 03 - Finalize

Persist or transition the authorized Defect.

## Input

One Defect, the change asked of it, and the authority for that change.

## Output

A session draft or one created or updated Defect identity.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and identity.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested transition.
3. **Authorize.** Confirm explicit approval or caller-provided bounded authority for content, target, status, order, estimate, and relations.
4. **Write.** Create or update only the authorized Defect and preserve unrelated fields.
5. **Link.** Apply [relations](../references/relations.md).
6. **Continue.** Apply [handoffs](../references/handoffs.md) to the next move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Defect and related artifacts unchanged |
| Transition only | state changes; no new draft |
| Affected artifacts | their reassessment is proposed, never inferred |
| No target | no write; session or Markdown requested |
| Existing match | identity preserved; no duplicate created |
| Order conflict | no write; occupied value returned without choosing another |
| Reported | one file under the standard path; unsupported sections absent |
| Ready | Expected, Actual, Reproduction, Impact, and Evidence are non-empty |
| Done | Verification proves expected behavior is restored |
