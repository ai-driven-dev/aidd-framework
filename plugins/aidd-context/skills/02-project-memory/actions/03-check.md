# 03 - Check

Judge the bank the project has, and say what drifted. Change nothing on your own.

## Input

The bank in `aidd_docs/memory/`, and the confirmed capabilities when a scan preceded this run.

## Output

A report file under `aidd_docs/tasks/`, a short summary printed, and the removals the user asked for.

## Process

1. **Match.** Compare the bank against [memory-destinations.md](../references/memory-destinations.md) and [structure.md](../references/structure.md).
   - A file no row produces: flag it, and name the row it should have come from.
   - A row whose capability [capability-signals.md](../references/capability-signals.md) marks always, or a path `structure.md` scaffolds, with nothing on disk: flag it as missing. Reading the bank backwards can never find it.
   - A capability the scan confirmed with no file on disk: flag it.
2. **Review.** Have each memory file reviewed against [review-protocol.md](../references/review-protocol.md) in parallel.
3. **Prune.** Offer to remove each file whose capability the confirmed set dropped.
   - No confirmed set: prune nothing, the bank on disk is the reference.
4. **Report.** Fill [report.md](../assets/report.md), one row per file and per finding.
   - Write it to `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_memory-check/report.md`, the dated task folder every AIDD artifact uses, then print the summary and that path.
   - The folder already holds a report: ask before replacing it.
   - Every finding is the user's to act on. Removing a file they named is the only change this action makes.

## Test

| Case | Pass |
| --- | --- |
| The action completes with no removal asked | no file under `aidd_docs/memory/` changed |
| The run finds anything at all | the printed summary holds no table, and names the report path |
| The bank holds a file no destination row produces | check flags it and names the expected row |
| An always capability has no file | check flags it as missing, with no scan before it |
| A file states something the code contradicts | check flags it and leaves the line in place |
| The same fact sits in two files | check flags the copy and leaves both files as they are |
| The user declines a removal | the file is still there after the action |
