# 01 - Code-quality audit

Read-only audit of the `code-quality` pillar, clean-code craftsmanship and tech debt. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `code-quality` findings, written to `code-quality.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Cover the two lenses below, using the project's conventions and coding rules already in context. Stay in this pillar: coupling belongs to `02-architecture`, runtime cost to `05-performance`, coverage to `06-tests`, CVEs to `04-dependencies`.
   - **Clean code**: naming clarity, single-responsibility and SOLID, DRY (copy-pasted logic, re-implemented stdlib helpers), readability, abstraction level, magic numbers, dead or misleading comments, code smells.
   - **Tech debt**: dead and unreachable code, unused exports, types, and helpers, stale TODOs, vestigial flags, cyclomatic complexity and file, function, or component length above project thresholds, nesting depth, error handling caught at the wrong boundary or silently swallowed.
   - Use a dedicated tool when available, for example an unused-export finder. Never assert dead code without evidence.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line`. The category is always `code-quality`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `code-quality`, a concrete `file:line`, and an effort.
- Coverage lists `code-quality` as scanned, and no code was changed.
