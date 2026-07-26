# 04 - Explain

Summarize the run for the user.

## Input

The comments from `collect`, the fixes from `apply`, and the result from `verify`.

## Output

A concise summary the user can read without re-reading the diff.

## Process

1. **Restate.** For each comment, restate in one line what it asked, in the user's words rather than copied.
2. **Report fix.** State the fix applied and why that solution over another, including any rejected suggestion and its reason.
3. **Report verification.** State the typecheck and review outcome, and the final diff's scope.

## Test

- Every comment from `collect` has one matching line in the summary.
- The summary stays free of diff prose — reasoning only, no line-by-line restatement.