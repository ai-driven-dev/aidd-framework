# 06 - Write

Record the feature experience as a versioned UI contract.

## Input

The frame, feature decisions, specialist fragments, system references, and unresolved items.

## Output

`ui.md` in the feature task folder, filled from [ui-contract.md](../assets/ui-contract.md), plus its id, revision, and SHA-256 body digest.

## Process

1. **Lock.** Acquire `.ui.lock` with an atomic directory create before reading mutable state.
   - Stop when the lock already exists.
   - Remove only the lock directory created by this run.
2. **Version.** Start at revision `1` or increment the exact current revision under the lock.
   - Set `supersedes` to `<feature-id>@<revision>`.
   - Archive the prior body at `.ui-history/<feature-id>@<revision>.md`.
3. **Pin.** Record each active system revision and required delta path.
   - `systems: []` is valid when no shared system decision applies.
   - Omit a future system entry for a no-base establishment only when no current matching id or equal or unorderable active scope overlap exists.
4. **Integrate.** Place fragments with [specialists.md](../references/specialists.md).
   - Keep an applicable concern unverified when its exact discovered provider name is absent.
5. **Status.** Write `status: draft` until [07-verify.md](07-verify.md) publishes the verified body.
   - Record blocking unknowns or draft, rejected, superseded, stale, or promoted dependencies.
   - Replace a promoted delta with its new system revision before verification.
6. **Write.** Render sibling temporary files on the same filesystem, then replace the current contract by atomic rename while the lock is held.
   - Create an archive with exclusive create only when a prior revision exists.
   - Require a matching body when the archive path already exists.
   - Remove asset placeholders and empty optional sections.
   - Never copy source code or delta bodies into the contract.
   - If interrupted after archive creation, retry only when the immutable archive matches.
   - Replace the current contract after an exact retry check.
7. **Verify.** Read back the archive when applicable and the current contract before releasing the lock.
   - Return the exact id, revision, and SHA-256 digest read from the published draft.

## Test

| Case | Pass |
| --- | --- |
| Contract written | id, revision, draft status, systems, and required deltas are valid |
| No shared system | a draft contract may use `systems: []` when no shared decision applies |
| Specialist unavailable | status remains draft and the gap is explicit |
| Specialist provenance missing | the contract stays draft |
| Required delta draft | status remains draft |
| Approved establishment | the draft may omit the not-yet-created system entry |
| Required delta promoted | pin the promoted system revision and remove the delta before verification |
| Revision | the prior revision is traceable and not silently lost |
| Archived revision | its body is immutable and resolves by id and revision |
| Concurrent revision | the write stops without replacing the newer contract |
| Existing lock | the write stops without mutation |
| Interrupted write | an exact retry completes the current write without changing history |
| Write receipt | id, revision, and digest match the published draft body |
| Evidence cited | the contract names paths and behavior without copying source syntax |
