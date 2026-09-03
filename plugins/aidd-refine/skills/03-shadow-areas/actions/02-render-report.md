# 02 - Render Report

Turn the detected gaps into a structured markdown report and write it next to the source.

## Input

- The gaps and warnings from `01-detect`.
- The source path, used to name and place the report.
- Optional: the three labelled sets from `03-diff` (closed, still open, newly introduced). Their presence switches on diff mode.

## Output

A markdown report written next to the source, named by stripping the source's last extension and appending `-shadow-report.md`.

## Process

1. **Load.** Start from the skeleton in [report-template.md](../assets/report-template.md).
2. **Name.** Derive the report's folder and filename from the source per the rule above.
3. **Warn.** If there are warnings, list them under `## Warnings` at the top. Otherwise omit the block.
4. **Group.** Lay gaps out by category in locked order ([locked-sets.json](../references/locked-sets.json)). In plain mode, one heading per category that has a gap. In diff mode, split each category into Closed, Still Open, and Newly Introduced, in that order, dropping empty parts.
5. **Sort.** Within a part, order gaps blocker, then major, then minor.
6. **Render.** Write each gap as `**[severity]** <question>`, with its snippet as a blockquote on the next line when present.
7. **Count.** Fill the header totals: overall and per severity. In diff mode, count only still-open and newly-introduced gaps.
8. **Stamp.** Mark the front matter `status: clean` when no blocker and no major remain in scope. Otherwise leave the status out.
9. **Write.** Save the report at the derived path.

## Test

- Gaps spanning several categories produce one heading per category, in locked order.
- Within a category, blocker comes before major before minor.
- A source named `feature-v2.draft.md` produces `feature-v2.draft-shadow-report.md`; `Makefile` produces `Makefile-shadow-report.md`.
- Zero blocker and zero major in scope stamps `status: clean`; closed gaps never count toward scope; otherwise no status key.
- Warnings present emits `## Warnings`; none omits it.
- The source content and timestamp are unchanged after the run.
- In diff mode a category with entries in all three parts renders Closed, then Still Open, then Newly Introduced.
