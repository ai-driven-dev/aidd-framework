# 03 - Finalize

Persist or transition the authorized Task.

## Input

The reviewed Task, target, and authority.

## Output

A session draft or one created or updated Task identity.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and identity.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested transition.
3. **Authorize.** Confirm content, target, classification, planning fields, and relations.
4. **Write.** Create or update only the authorized Task and preserve unrelated fields.
5. **Link.** Apply [relations](../references/relations.md).
6. **Verify.** Read the result back and offer its next delivery move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Task and related artifacts unchanged |
| No target | no write; session or Markdown requested |
| Existing match | identity preserved; no duplicate created |
| Approved write | exactly one Task; optional fields are earned |
| Done | done conditions and completion evidence are non-empty |
| Parent | Epic, Story, or Defect; absent only for explicit standalone work |
