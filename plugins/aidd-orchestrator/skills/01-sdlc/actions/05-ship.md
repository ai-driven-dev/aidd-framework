# 05 - Ship

Commit and open a change request (pull or merge request) via the project's VCS once the review verdict is `ship`.

## Input

The `ship` verdict from `04` including its reviewed `HEAD` SHA, the plan path from `02`, and the phase results from `03` that drive the commit and the change-request body.

## Output

The commit SHA and the change-request URL on the project's VCS host.

## Process

1. **Gate.** Confirm `04` returned a `ship` verdict and HEAD is on a non-default branch. Without a `ship` verdict, or on `iterate`, stop and re-run `04` (looping to `03` on `iterate`). On the default branch, stop with `contract_violation: on_default_branch` and commit nothing.
2. **Freshness.** Confirm no code landed after the reviewed SHA: `git diff --name-only <reviewed-sha> HEAD` must list only plan-tracking files. Any source change means the review is stale, so stop and re-run `04`. Never ship unreviewed code.
3. **Commit.** Invoke a commit capability, discovered at runtime, with the plan's objective. It picks the message format; never dictate one here.
4. **Open.** Invoke a change-request capability, discovered at runtime, to push the branch and open the request. Reference the plan path in the body.
5. **Return.** Surface the commit SHA and the change-request URL.

## Test

- `git diff --name-only <reviewed-sha> HEAD` lists only plan-tracking files: no source change shipped unreviewed.
- The commit SHA exists in `git log` of the working branch.
- The change-request URL is non-empty and points to the project's VCS host.
- The change-request body references the plan path.
- On the default branch, the action stops with `contract_violation: on_default_branch` and makes no commit.
