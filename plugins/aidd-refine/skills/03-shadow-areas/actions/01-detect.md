# 01 - Detect

Parse the source artifact and pull out a list of gaps, each tagged with a category, a severity, and a direct question.

## Input

- The source to scan: a file path or inline markdown text.

## Output

A list of gaps, each with its category, severity, a probe question, and the quoted snippet it came from, plus any top-of-report warnings such as a non-markdown source.

## Process

1. **Load.** Read the locked categories and their definitions from [locked-sets.json](../references/locked-sets.json) and [categories.md](../references/categories.md).
2. **Validate.** Check the source. Reject anything outside the working directory or already named `*-shadow-report.md`.
3. **Handle edges.** An empty source stops with a plain warning that there is nothing to scan, emitting no gap. A non-markdown source adds a warning that attribution may be imprecise, then continues.
4. **Scan.** Walk the seven categories in their locked order. Emit one gap per distinct issue, set its severity from [severity-rubric.md](../references/severity-rubric.md), and write its question per [probe-style.md](../references/probe-style.md).
5. **Dedupe.** Treat two gaps with the same category and snippet as one. A snippet-less gap falls back to its category plus severity.
6. **Return.** Hand the gaps and warnings to the next action: `03-diff` when a prior report exists, else `02-render-report`. Sorting happens there.

## Test

- A path outside the working directory, or a file named `*-shadow-report.md`, is rejected with no gaps.
- An empty source stops with a warning and no gap.
- A non-markdown source adds one warning and keeps scanning.
- Every gap has a category and severity from the locked set and a question ending in `?`.
- A repeated gap (same category and snippet) appears once.
