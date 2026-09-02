# 03 - Commit

Record each atomic commit, recover from safe scoped failures, then report and optionally push the run.

## Input

The commit plan and staged set from `01-collect`, the message from `02-message`, the run ledger, and whether to push (a trailing `push` argument).

## Output

The branch, push outcome, correction summary, and one final row per created commit.

## Process

1. **Commit.** Run `git commit` with the message.
2. **Classify.** When a hook rejects the commit, identify the failing check, its decisive error, and every file changed by the hook.
3. **Recover.** Correct and retry only when the fix is deterministic and can be restricted to the current commit's files.
   - Re-stage only in-scope files changed by the hook or the correction.
   - A message-policy failure loops through `02-message`; a path-bounded format or lint failure may use its specific fixer.
   - Never run a repository-wide fixer, alter unrelated changes, or guess at a semantic, product, security, or architecture decision.
   - Append the cycle's problem, correction, and result to the run ledger.
   - Stop when the same failure repeats without meaningful progress, the correction needs broader authority, or the retry after the third correction still fails.
4. **Record.** After success, read the commit timestamp, short sha, subject, and committed file count from the created commit itself, then append them to the run ledger. Render the timestamp in the user's local timezone when known; otherwise preserve git's recorded offset.
5. **Repeat.** Return to `01-collect` for the next planned concern, preserving the ledger.
6. **Push.** After the last concern, push once when asked. Use `--force-with-lease` only when explicitly required, never `--force`.
7. **Report.** Emit the correction summary followed by the commit table. Do not add a validation column.

If no correction was needed:

> No correction needed.

If corrections were made:

| Cycle | Problem detected | Correction applied | Result |
| ---: | --- | --- | --- |
| 1 | `<decisive failure>` | `<bounded correction or reason for stopping>` | `<Fixed or Blocked>` |

Always finish with:

| Date and time | Commit | Message | Files |
| --- | --- | --- | ---: |
| `<local date and time>` | `<short sha>` | `<subject>` | `<count>` |

## Test

- `git rev-parse HEAD` returns the new sha and its message matches the project convention.
- Every correction and re-staged file belongs to the current commit's authorized scope.
- A repeated, ambiguous, semantic, out-of-scope failure, or a failure after the third correction leaves no commit for that concern and reports the blocker.
- The correction summary contains exactly the cycles that changed something; the final table contains exactly the commits created by this run.
- When pushed, the remote branch shows the final sha.
