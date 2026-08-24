# 04 - Write

Record the review without changing normative UI artifacts.

## Input

The pinned evidence, coverage result, and prioritized findings.

## Output

`ui-review.md` beside the supplied task artifact or in `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<target-slug>/`, filled from [review-report.md](../assets/review-report.md).

## Process

1. **Pin.** Record the target, commit, relevant-worktree fingerprint, UI contract revision, and UI system revisions.
2. **Integrate.** Add only overall priority and owner to specialist findings.
3. **Separate.** List unassessed concerns and unavailable evidence outside findings.
4. **Write.** Remove placeholders and empty optional sections from the nonnormative report.
5. **Verify.** Read back the report and confirm no source, contract, system, or memory file changed.

## Test

| Case | Pass |
| --- | --- |
| Report written | its evidence target is reproducible from pinned identifiers |
| Specialist finding | its verdict matches provider output |
| No findings | coverage and evidence gaps remain explicit |
| Read-only review | only `ui-review.md` is created or updated |
