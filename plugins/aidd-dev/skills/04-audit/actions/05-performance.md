# 05 - Performance audit

Read-only audit of the `performance` pillar, runtime cost, query patterns, and rendering efficiency. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `performance` findings, written to `performance.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Prefer runtime tools (profiler, bundle analyzer, query explain) when available. Stay in this pillar: cyclomatic complexity belongs to `01-code-quality`, coupling to `02-architecture`.
   - **N+1 queries**: detect loops that issue a database or network call on each iteration without batching.
   - **Unbatched heavy operations**: flag heavy computations or I/O repeated individually where a batch or bulk API exists.
   - **Unpaginated large payloads**: identify endpoints or queries that fetch unbounded result sets without a limit or pagination.
   - **Bundle size**: use a bundle analyzer when available. Flag large or duplicated dependencies that inflate the JS or CSS payload.
   - **Render thrash**: detect layout-thrashing DOM patterns, missing memoization on computed values used in hot render paths, or component trees that re-render without a guard on reference-stable props.
   - **Missing memoization on hot paths**: flag expensive pure computations inside render or tight loops that are not memoized.
   - When no profiler or bundle analyzer is available, degrade to static heuristics and record "no profiler, static heuristics only" in `Coverage > Skipped`. Never assert a runtime bottleneck without evidence.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line`. The category is always `performance`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `performance`, a concrete `file:line`, and an effort.
- Coverage lists `performance` as scanned, and no code was changed.
