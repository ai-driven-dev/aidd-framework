# 05 - Finalize

Let the user refine, extend, keep, or persist the Product Brief.

## Input

The draft, its sources, and authority.

## Output

An authorized Product Brief in session or at its resolved path. After writing, report its stable identity, changed fields as `before -> after`, affected relations, and verification result. Without a write, state that no persisted change occurred.

## Process

1. **Authorize.** Use caller-provided bounded authority or invite revision, discovery, session approval, or persistence. Without persistence authority, ask session or persist and wait.
2. **Place.** Apply [persistence](../references/persistence.md) to resolve authorized files.
3. **Confirm.** Require authority for both files in a replacement.
4. **Write.** Persist authorized files; preserve user edits.
5. **Verify.** Read back every changed brief.
6. **Continue.** Apply [handoffs](../references/handoffs.md) to the next move.

## Test

| Case | Pass |
| --- | --- |
| Unauthorized draft | workspace unchanged; response ends with one open feedback question |
| Content approval only | workspace unchanged; session or persistence requested |
| Initial persistence | one `current` brief created; relation fields absent |
| Existing persistence | one `current` brief changed; unauthorized edits preserved |
| Replacement | new brief owns `supersedes`; old brief only becomes `superseded` |
| Report | written path exists, matches the standard path, and is usable as an Epic goal or PRD source |
| Write receipt | stable identity, `before -> after` fields, affected relations, and verification result reported |
| No write | response states that no persisted change occurred |
