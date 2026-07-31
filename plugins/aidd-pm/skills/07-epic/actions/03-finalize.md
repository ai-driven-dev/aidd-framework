# 03 - Finalize

Approve and persist the Epic, or keep it in the session.

## Input

The reviewed Epic with its route and authority.

## Output

The session draft or one created or updated Epic with its links.

## Process

1. **Resolve.** Apply [persistence](../references/persistence.md) to select the target and create-or-update route.
2. **Status.** Apply [lifecycle](../references/lifecycle.md) from the review evidence.
3. **Authorize.** Confirm explicit approval or caller-provided bounded authority for content, target, and related-item changes.
4. **Write.** Create or update exactly one Epic and preserve fields outside the authorized change.
5. **Link.** Apply [relations](../references/relations.md).
6. **Continue.** Offer to derive User Stories from the persisted or session Epic.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized | Epic and related artifacts are unchanged |
| No target | no write or state report; response ends with a session-or-Markdown question |
| Existing match | identity and unauthorized fields preserved; no duplicate created |
| Approved write | exactly one Epic identity; one owner per relation; no empty optional field |
| Goal | optional stable reference on the Epic; not duplicated as source |
| Done | success evidence confirms the outcome; child closure alone is insufficient |
