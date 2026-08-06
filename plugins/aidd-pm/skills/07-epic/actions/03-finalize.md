# 03 - Finalize

Approve and persist the Epic, transition it, or keep it in the session.

## Input

One Epic, the change asked of it, and the authority for that change.

## Output

The session draft or one created or updated Epic with its links. After a write, report the stable identity, changed fields as `before -> after`, affected relations, and the verification result. For a draft or no-write result, state that no persisted change occurred.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the target and create-or-update route.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) to every requested transition.
3. **Authorize.** Confirm approval or bounded write authority; otherwise return the proposal.
4. **Link.** Apply [relations](../references/relations.md).
5. **Write.** Create or update exactly one Epic and preserve fields outside the authorized change.
6. **Verify.** Read the affected graph back and report what changed.
7. **Continue.** Apply [handoffs](../references/handoffs.md) to the next move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Epic and related artifacts are unchanged |
| Transition only | state changes; no new draft |
| Children | their fate is proposed, never inferred |
| No target | no write or state report; response ends with a session-or-Markdown question |
| Existing match | identity and unauthorized fields preserved; no duplicate created |
| Approved write | exactly one Epic identity; one owner per relation; no empty optional field |
| Done | success evidence confirms the outcome; child closure alone is insufficient |
