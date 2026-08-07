# 04 - Validate

Review the written skill against the contract and fix what breaks.

## Input

The skill written by 03.

## Output

A report, one row per file: what was checked and any fix applied.

## Process

1. **Review.** Review each file against [review-protocol.md](../references/review-protocol.md).
2. **Fix.** Apply the confirmed fixes on disk, then re-review the changed files.
3. **Report.** Deliver the findings, even when clean.

## Test

| Case | Pass |
| --- | --- |
| The report is delivered | every written file has a row, with its findings or none |
| The review finds a breach | it names the broken rule and a `file:line` |
| A fix is confirmed | the file differs on disk and is reviewed again |
