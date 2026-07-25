# 04 - Review

Judge the completed work against an explicit validator and emit a ship-or-iterate verdict.

## Input

The working diff or paths produced by `03`, the validator (the plan path and acceptance criteria), and any related context the checker needs.

## Output

A `ship` or `iterate` verdict with the reviewed items, findings, completion and quality scores, and the reviewed `HEAD` SHA (the commit the checker saw), from the review capability. The plan reaches `status: reviewed` on ship, and stays `implemented` on iterate.

## Process

1. **Discover.** Find the diff review capability at runtime by description.
2. **Capture.** Record the current `HEAD` sha as the reviewed SHA. This is the exact code the checker judges, and the anchor `05-ship` checks against.
3. **Spawn.** Spawn the `checker` agent with the inputs above. Brief it to run the review capability on that diff, let that skill write and own its report, and return the verdict and findings.
4. **Map.** When every check passes, the verdict is `ship`. On any blocking finding, the verdict is `iterate`.
5. **Mark.** On `ship`, set the plan frontmatter `status: reviewed` and commit it. Carry the reviewed SHA in the verdict. On `iterate`, leave the plan `implemented`: the loop fixes the diff, not the plan.
6. **Iterate.** On `iterate`, return the findings as the fix list for `03`. The next `04` re-captures the SHA on the fixed diff; ship is reached only when a review of the current diff passes.

## Test

- The verdict is `ship` or `iterate`, and the scores are integers between 0 and 100.
- The verdict carries the reviewed `HEAD` SHA.
- The findings are non-empty on `iterate`.
- The plan frontmatter reads `status: reviewed` only after a `ship` verdict on the current diff.
