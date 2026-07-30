# 05 - Finalize

Let the user refine, extend, keep, or persist the Product Brief.

## Input

The draft, its sources, and authority.

## Output

An authorized Product Brief in session or at its resolved path.

## Process

1. **Authorize.** Use caller-provided bounded authority or invite revision, discovery, session approval, or persistence.
2. **Clarify.** Without persistence authority, ask session or persist and wait.
3. **Place.** Apply [persistence](../references/persistence.md) to resolve authorized files.
4. **Confirm.** Require authority for both files in a replacement.
5. **Write.** Persist authorized files; preserve user edits.
6. **Verify.** Read back every changed brief.
7. **Continue.** Offer to frame an Epic linked to the brief as its goal.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized draft | workspace unchanged; response ends with one open feedback question |
| Content approval only | workspace unchanged; session or persistence requested |
| Initial persistence | one `current` brief created; relation fields absent |
| Existing persistence | one `current` brief changed; unauthorized edits preserved |
| Replacement | new brief owns `supersedes`; old brief only becomes `superseded` |
| Report | written path exists, matches the standard path, and is usable as an Epic goal or PRD source |
