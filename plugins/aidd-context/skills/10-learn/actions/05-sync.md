# 05 - Sync

Refresh context references after memory or ADR writes.

## Input

The write summary, confirming at least one memory or ADR file changed.

## Output

Each memory block lists the current memory files, and the memory index is refreshed.

## Process

1. **Resolve.** Resolve hook arguments with [sync arguments](../references/sync-arguments.md).
2. **Run.** Find and run `update_memory.js <args>`.
3. **Stop.** Stop on failure and print the error.
4. **Review.** Apply [review protocol](../references/review-protocol.md) to the updated context files.
5. **Report.** Report the updated files and the review verdict.

## Test

| Case | Pass |
| --- | --- |
| A context file is synced | its memory block references every file in the bank |
| The report is delivered | it names the files updated, never a fixed count |
| The sync returns | its result is checked before the action ends |
| The action completes | `git diff --cached` is unchanged |
