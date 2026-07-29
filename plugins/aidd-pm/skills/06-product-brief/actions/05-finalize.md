# 05 - Finalize

Let the user refine, extend, keep, or persist the Product Brief.

## Input

The draft and its sources.

## Output

An approved Product Brief in session or at its resolved path.

## Process

1. **Ask.** Invite revision, further discovery, session approval, or persistence in one open question.
2. **Clarify.** After content-only approval, ask session or persist and wait.
3. **Place.** Apply [persistence](../references/persistence.md) to resolve approved files.
4. **Confirm.** For a replacement, show both changes and wait.
5. **Write.** Persist approved files; preserve user edits.
6. **Verify.** Read back every changed brief.

## Test

| Case | Pass |
| --- | --- |
| Unapproved draft | workspace unchanged; response ends with one open feedback question |
| Content approval only | workspace unchanged; session or persistence requested |
| Initial persistence | one `current` brief created; relation fields absent |
| Existing persistence | one `current` brief changed; unapproved edits preserved |
| Replacement | two briefs changed; statuses and project-relative relation paths are reciprocal |
| Report | written path exists, matches the standard path, and is usable by PRD |
