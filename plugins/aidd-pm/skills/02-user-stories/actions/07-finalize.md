# 07 - Finalize

Approve and persist the Stories, transition them, or keep them in the session.

## Input

The Stories, the change asked of them, and the authority for that change.

## Output

The session drafts or the created and updated Story identities. After a write, report each stable identity, changed fields as `before -> after`, affected relations, and the verification result. For a draft or no-write result, state that no persisted change occurred.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and create-or-update route.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested state change.
3. **Authorize.** Confirm approval or bounded write authority; otherwise return the proposal.
4. **Link.** Apply [relations](../references/relations.md).
5. **Write.** Create or update only the authorized Stories and preserve fields outside the authorized change.
6. **Verify.** Read the affected graph back and report what changed.
7. **Report.** Return every persisted identity, then apply [handoffs](../references/handoffs.md) to the next move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Story and related artifacts are unchanged |
| Transition only | state changes; no new draft |
| Parent | its reassessment is proposed, never inferred |
| No target | no write or state report; response ends with a session-or-Markdown question |
| Existing match | identity and unauthorized fields preserved; no duplicate created |
| Approved write | exactly one identity per Story; every relation has one owner and no mirrored inverse |
| Markdown | one file per Story under the standard path; source and parent files unchanged unless separately authorized |
| Status change | transition exists in `lifecycle`; `done` passes acceptance and project Definition of Done |
