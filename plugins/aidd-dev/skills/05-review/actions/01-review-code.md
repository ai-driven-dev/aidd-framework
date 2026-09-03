# 01 - Review Code

Grade the diff against clean-code principles and record the findings in the review report.

## Input

The diff to review, a git ref range or path, from the arguments; defaults to the diff against the repository default branch. The plan, when in scope, to tag each finding's phase.

## Output

Rows in the `Findings` table of the feature folder's `review.md`, kind `code`, each rated and citing a changed `file:line`.

## Process

1. **Resolve.** Take the diff from the arguments, otherwise the diff against the repository default branch.
2. **Review.** Read every changed line for clean-code: naming, structure, complexity, smells, error handling. No runtime checks. Rule conformance is the relevancy lens, not this one.
3. **Rate.** One row per issue, rated per [review-rubric.md](../references/review-rubric.md), citing a `file:line`.
4. **Record.** Append one row per finding to the `Findings` table: kind `code`, Phase the plan phase the file falls in or `-`. Write "None." when the run found nothing.

## Test

- Each code finding is a `Findings` row, kind `code`, rated and citing a changed `file:line`.
- No code is patched.
