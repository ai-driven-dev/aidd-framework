# 01 - Resolve

Resolve deterministic conflicts or approved proposals.

## Input

An active conflict, optionally with its approved decision table.

## Output

A resolved working tree and decision table, or an unapplied proposal, formatted with [resolution table](../assets/resolution-table.md).

## Process

1. **Inspect.** Read the operation, unmerged paths, and conflicted hunks; if none exist, report and stop.
2. **Decide.** Add one row per conflict to the [resolution table](../assets/resolution-table.md): matching approved rows keep their choice; identical sides keep common content; otherwise propose ours, theirs, or both with a reason.
3. **Gate.** If a proposal lacks approval, return the unchanged table and stop; otherwise confirm approved rows still match.
4. **Resolve.** Apply every decided row and stage the resolved paths.
5. **Validate.** Confirm no unmerged paths and a cached whitespace check limited to resolved paths; otherwise report the failed check.

## Test

| Case | Pass |
| ---- | ---- |
| deterministic conflict | markers are removed, Git has no unmerged paths, and rows are `Applied` |
| unapproved proposal | conflicted files and index entries stay unchanged, and rows are `Proposed` |
| approved proposal | matching choices apply, Git has no unmerged paths, and rows are `Applied` |
| unrelated staged error | resolved-path validation passes and the unrelated file stays untouched |
| no active conflict | no file or index entry changes, and the run reports no conflict |
