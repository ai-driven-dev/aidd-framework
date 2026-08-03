# 07 - Finalize

Approve and persist the Stories, transition them, or keep them in the session.

## Input

The Stories, the change asked of them, and the authority for that change.

## Output

The session drafts or the created and updated Story identities.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the support and create-or-update route.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested state change.
3. **Authorize.** Confirm explicit approval or caller-provided bounded authority for content, target, status, order, estimate, and relations.
4. **Write.** Create or update only the authorized Stories and preserve fields outside the authorized change.
5. **Link.** Apply [relations](../references/relations.md).
6. **Report.** Return every persisted identity, then apply [handoffs](../references/handoffs.md) to the next move.

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
