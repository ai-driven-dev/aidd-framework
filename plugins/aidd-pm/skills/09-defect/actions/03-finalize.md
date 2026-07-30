# 03 - Finalize

Persist or transition the authorized Defect.

## Input

The assessed Defect, target, and authority.

## Output

A session draft or one created or updated Defect identity.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and identity.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested transition.
3. **Authorize.** Confirm explicit approval or caller-provided bounded authority for content, target, order, estimate, and relations.
4. **Write.** Create or update only the authorized Defect and preserve unrelated fields.
5. **Link.** Store authorized metadata on its owning artifact without mirrored inverses.
6. **Continue.** Offer the next investigation, delivery, or verification move without performing it.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Defect and related artifacts unchanged |
| No target | no write; session or Markdown requested |
| Existing match | identity preserved; no duplicate created |
| Order conflict | no write; occupied value returned without choosing another |
| Reported | one file under the standard path; unearned sections absent |
| Ready | Expected, Actual, Impact, and Evidence are non-empty |
| Done | Verification proves expected behavior is restored |
