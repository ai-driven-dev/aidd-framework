# 07 - Verify

Prove the UI contract is internally consistent and publish its readiness atomically.

## Input

The draft `ui.md`, its expected id, revision, and SHA-256 digest from [06-write.md](06-write.md), plus referenced systems, deltas, requirements, and specialist fragments.

## Output

The verified `ui.md` marked `ready`, or a readiness result with the draft and defects routed back to composition or writing.

## Process

1. **Lock.** Acquire `.ui.lock` with an atomic directory create and re-read the current draft.
   - Stop when the lock already exists.
   - Remove only the lock directory created by this run.
   - Stop when id, revision, or SHA-256 body digest differs from the write receipt.
2. **Resolve.** Resolve every pinned revision and required-delta path.
   - For a no-base establishment, prove no current contract has its id and no active contract has an equal or unorderable scope overlap.
   - Permit `systems: []` only when no shared system decision applies.
3. **Trace.** Confirm each hard requirement maps to a decision or explicit unresolved item and every applicable state has observable behavior.
4. **Compare.** Confirm specialist fragments and exact provider names with [specialists.md](../references/specialists.md), then prove feature decisions do not redefine shared system rules.
5. **Classify.** Return `ready`, `draft`, or a fixable defect.
   - Route content defects to `compose`.
   - Route serialization or version defects to `write`.
6. **Reject.** Fail any placeholder, unsupported compliance claim, implementation code, CSS, or framework recipe.
7. **Finalize.** Apply exactly one classified outcome.
   - For `ready`, replace only the draft status through a sibling temporary file and atomic rename while the lock is held.
   - For `ready`, read back the exact verified body and status before releasing the lock.
   - For `draft` or a defect, leave the contract byte-identical and return the owning action.

## Test

| Case | Pass |
| --- | --- |
| Ready contract | all references resolve and no blocking item remains |
| Ready publication | no `ready` body is visible before all checks pass |
| Stale system revision | status is draft until explicitly reconciled |
| Establishment delta | ready only with `base_revision: null`, no current matching id, and no equal or unorderable active scope overlap |
| No shared system | a ready contract proves its decisions from feature evidence without inventing shared conventions |
| Specialist fragment | provenance and verdict match the provider output |
| Missing provider name | the applicable concern prevents ready publication |
| Final output | only the draft status changes while application source, system contracts, and memory remain unchanged |
| Verification failure | `ui.md` remains byte-identical and the owning action is named |
| Existing lock | verification stops without mutation |
| Concurrent revision | verification stops instead of publishing another run's draft |
