# 01 - Prepare

Resolve the plan, put the workspace on a feature branch, and mark the plan in-progress.

## Input

A plan, passed as arguments as a path or inline content.

## Output

The resolved plan on a feature branch with its frontmatter `status: in-progress`, ready for the phase loop. Or a fail-fast stop when no plan resolves.

## Process

1. **Resolve.** Resolve the plan from the arguments. A path must exist and be readable. With neither a readable file nor inline content, stop with `plan not found at <path>`. Never fabricate a plan.
2. **Revalidate UI.** Validate every referenced UI contract, system revision, and delta before mutation.
   - Stop when the UI contract's feature folder contains `.ui.lock`.
   - Require a current ready contract and current active system revisions.
   - Permit a no-base establishment only without a current matching id or equal or unorderable active scope overlap.
   - Permit `systems: []` when the contract proves no shared system decision applies.
   - Require each approved delta in one `Implement deltas` owner phase.
   - Require verified deltas only under `Consume deltas`.
   - Permit an already-satisfied approved delta only when its owner phase is done in this plan.
   - Stop with `replan needed` for any stale, invalid, changed, competing, or misowned reference.
3. **Branch.** On the default branch, create a feature branch and announce it. On a non-default branch, keep it.
4. **Mark.** Set the plan frontmatter `status: in-progress` as a runtime marker. No separate commit: it rides into the first phase commit, or into the `implemented` commit if there is no phase to code.

## Test

- A missing or unreadable plan with no inline content stops with `plan not found at <path>`, and no plan is fabricated.
- Stale UI references stop with `replan needed` before branch or status mutation.
- Delta ownership is complete and unique before branch or status mutation.
- A no-base establishment delta fails when a current matching id or equal or unorderable active scope overlap appears.
- An in-flight UI contract fails while `.ui.lock` exists.
- A contract without a shared system passes only when no shared system decision applies.
- The current branch is not the default branch.
- The plan frontmatter reads `status: in-progress`.
