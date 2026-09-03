# 03 - Check

Show what drifted in the bank, and let the user pick what to fix. Change nothing.

## Input

The bank in `aidd_docs/memory/`, and the capabilities the scan found.

## Output

A report file under `aidd_docs/tasks/`, a short summary printed, and the findings the user approved.

## Process

1. **Match.** Compare the bank against [memory-destinations.md](../references/memory-destinations.md) and [structure.md](../references/structure.md).
   - A file no row produces: flag it, and name the row it should have come from.
   - A found capability, or a scaffolded path, with nothing on disk: flag it missing.
2. **Review.** Have each memory file reviewed against [review-protocol.md](../references/review-protocol.md) in parallel.
3. **Prune.** Offer to remove each file whose capability the scan did not find, and none when the scan asked nothing.
4. **Report.** Fill [report.md](../assets/report.md), write it to `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_memory-check/report.md`, and print the summary with that path.
   - The folder already holds a report: ask before replacing it.
5. **Offer.** Ask which findings to apply, and hand the approved ones to write.
   - Nothing drifted: call the bank current, hand nothing on.

## Test

| Case | Pass |
| --- | --- |
| Any run | no file under `aidd_docs/memory/` changed |
| Any finding | the summary holds no table, names the report path, ends on the question |
| Nothing drifted | nothing offered, the bank called current |
| Report | structural gaps and reviewer findings under separate headings |
| Report | no step of this skill named in it |
| Orphan | flagged, with the row it should have come from |
| Missing | a found capability with no file is flagged |
| Contradiction | flagged, the line left in place |
| Duplicate | flagged, both files left as they are |
| Removal declined | the file is still there |
