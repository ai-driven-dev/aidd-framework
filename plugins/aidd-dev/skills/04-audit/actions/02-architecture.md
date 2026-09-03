# 02 - Architecture audit

Read-only audit of the `architecture` pillar, conformance to documented architecture, module coupling, and layer or boundary violations. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `architecture` findings, written to `architecture.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Read the architecture documents already in context (`aidd_docs/memory`, ADRs, C4 diagrams). Stay in this pillar: intra-file craftsmanship belongs to `01-code-quality`, runtime cost to `05-performance`, CVEs to `04-dependencies`.
   - **Conformance**: map the actual code structure against the documented modules, layers, and C4 boundaries. Flag any divergence from the stated architecture.
   - **Coupling**: identify modules that import from layers they should not depend on, a wrong dependency direction or a circular reference across bounded contexts.
   - **God-modules**: detect modules with an abnormally large surface area, too many exports or responsibilities, that signal architectural erosion.
   - When ADRs or C4 diagrams are absent, note "no architecture docs found, conformance check skipped" in `Coverage > Skipped` and limit the scan to observable coupling heuristics.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line`. The category is always `architecture`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `architecture`, a concrete `file:line`, and an effort.
- Coverage lists `architecture` as scanned, and no code was changed.
