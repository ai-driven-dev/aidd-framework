# 03 - Finalize

Persist or transition the authorized Task.

## Input

One Task, the change asked of it, and the authority for that change.

## Output

A session draft or one created or updated Task identity. After a write, report the stable identity, changed fields as `before -> after`, affected relations, and the verification result. For a draft or no-write result, state that no persisted change occurred.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and identity.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested transition.
3. **Authorize.** Confirm approval or bounded write authority; otherwise return the proposal.
4. **Link.** Apply [relations](../references/relations.md).
5. **Write.** Create or update only the authorized Task and preserve unrelated fields.
6. **Verify.** Read the affected graph back and report what changed.
7. **Continue.** Apply [handoffs](../references/handoffs.md) to the next move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Task and related artifacts unchanged |
| Transition only | state changes; no new draft |
| Parent | its reassessment is proposed, never inferred |
| No target | no write; session or Markdown requested |
| Existing match | identity preserved; no duplicate created |
| Approved write | exactly one Task; no unsupported optional field |
| Done | done conditions and completion evidence are non-empty |
| Order conflict | no write; the occupied value is returned without choosing another |
