# 03 - Diff

Load the prior shadow report, compare it with the freshly detected gaps, and sort each gap into closed, still open, or newly introduced.

## Input

- The current run's gaps from `01-detect`.
- The source path, used to find the prior report by the same naming rule as `02-render-report`.

## Output

Three labelled sets handed to `02-render-report`: closed (in the prior report, gone now), still open (in both runs), and newly introduced (new this run).

## Process

1. **Locate.** Derive the prior report's path from the source, same rule as `02-render-report`.
2. **First run.** If no prior report exists, everything is newly introduced and the other two sets are empty. Stop. This is the expected first run.
3. **Parse.** Read the prior report: walk its category sections, treat each `**[severity]** <question>` line as a gap, and take an immediately following blockquote as its snippet. Diff-mode sections parse the same way.
4. **Match.** Identify gaps by category plus snippet, ignoring question wording, so a reworded question is not seen as new. A snippet-less gap falls back to category plus severity, matching `01-detect`'s dedupe rule so identity stays consistent across runs.
5. **Sort.** Compare the two runs to fill closed, still open, and newly introduced. Each gap keeps its category and severity; closed gaps carry the prior question, the others the current one.
6. **Hand off.** Pass the three sets to `02-render-report`.

## Test

- No change between runs: every gap is still open, closed and newly introduced empty.
- A prior gap whose anchor is gone lands in closed; a gap absent from the prior report lands in newly introduced.
- First run with no prior report: every current gap is newly introduced, the rest empty, no error.
- A reworded question, or a snippet-less gap with the same category and severity, stays still open (gaps match by category and snippet, not wording).
