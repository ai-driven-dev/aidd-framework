# 03 - Verify

Confirm the applied fixes typecheck and hold up to review.

## Input

The files modified by `apply`.

## Output

A verification result: typecheck status and the review findings, all resolved.

## Process

1. **Typecheck.** Run the project's typecheck on the touched files or packages (e.g. `tsc --noEmit`, or the repo's equivalent).
2. **Review.** Invoke `aidd-dev:05-review` on the modified files, at a level matched to the diff's size.
3. **Resolve.** Fix every confirmed finding, then re-run both checks on the changed files.

## Test

- The typecheck run against the touched files reports no error.
- Every finding `aidd-dev:05-review` confirmed is either fixed or explicitly reasoned against, never silently dropped.