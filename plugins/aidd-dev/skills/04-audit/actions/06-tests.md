# 06 - Tests audit

Read-only audit of the `tests` pillar, coverage gaps, test quality, and suite health. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `tests` findings, written to `tests.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Prefer a coverage report when available. Stay in this pillar: whether a feature behaves correctly is a separate concern, runtime cost belongs to `05-performance`.
   - **Critical-path coverage gaps**: identify code paths (auth flows, data mutations, error handling) with no test. Use a coverage report when available, degrade to static inspection of test-file presence when absent.
   - **Tests asserting implementation, not behavior**: flag tests coupled to internal method names, private state, or implementation details rather than observable outputs.
   - **Flaky tests**: flag tests that use arbitrary `sleep` calls, rely on timing, or have known intermittent failures recorded in CI history or inline comments.
   - **Skipped tests without a reason**: flag `skip`, `xit`, `xfail`, `.todo`, or equivalent markers that lack an explanatory comment or issue reference.
   - **Test pyramid imbalance**: flag suites with disproportionately many end-to-end or integration tests and few unit tests, raising maintenance cost and slowing feedback.
   - When no coverage tool is available, record "no coverage tool, static inspection only" in `Coverage > Skipped` and limit findings to structurally observable issues. Do not invent coverage numbers.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line`. The category is always `tests`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `tests`, a concrete `file:line`, and an effort.
- Coverage lists `tests` as scanned, and no code was changed.
