# 05 - Sync

Refresh context references after memory or ADR writes.

## Input

The write summary, confirming at least one memory or ADR file changed. Skip this action when write only handed off rules or skills.

## Output

Each memory block lists the current memory files, and the memory index is refreshed.

## Process

1. Resolve hook arguments with [sync arguments](../references/sync-arguments.md).
2. Find and run `update_memory.js <args>`.
3. Stop on failure and print the error.
4. Apply [review protocol](../references/review-protocol.md) to updated context files.
5. Report updated files and review verdict.

## Test

| Case | Pass |
| --- | --- |
| A context file is synced | its memory block references every file in the bank |
| The report is delivered | it names the files updated, never a fixed count |
| The sync returns | its result is checked before the action ends |
| The action completes | `git diff --cached` is unchanged |
