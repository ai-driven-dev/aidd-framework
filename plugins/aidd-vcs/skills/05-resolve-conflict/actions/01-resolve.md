# 01 - Resolve

Resolve an active Git conflict only when its complete decision set is deterministic.

## Input

An active Git merge, rebase, or cherry-pick conflict.

## Output

A resolved working tree and decision table, or an unapplied proposal table, formatted with [resolution table](../assets/resolution-table.md).

## Process

1. **Inspect.** Read the active Git operation, every unmerged path, and the complete content of each conflicted hunk; when no unmerged path exists, report that no active conflict was found and stop.
2. **Classify.** Add one row per conflict to the [resolution table](../assets/resolution-table.md); mark a hunk deterministic only when both sides contain exactly the same content, and otherwise propose to keep ours, keep theirs, or combine both with concrete reasoning.
3. **Gate.** Continue only when every row is deterministic; otherwise present the table with `Proposed` status and stop without changing or staging files.
4. **Resolve.** Replace every deterministic conflict marker with its common content, then stage the resolved conflict files.
5. **Validate.** Confirm that Git reports no unmerged paths and that `git diff --cached --check -- <resolved paths>` succeeds; if either check fails, stop and report the failed check without touching unrelated files.

## Test

| Case | Pass |
| ---- | ---- |
| identical conflict sides | all conflict markers are removed, Git reports no unmerged paths, and every table row is `Applied` |
| divergent conflict sides | every conflicted file and index entry remain unchanged, and every table row is `Proposed` |
| unrelated staged whitespace error | validation of resolved paths passes and the unrelated staged file remains untouched |
| no active conflict | no file or index entry changes, and the run reports that no active conflict was found |
