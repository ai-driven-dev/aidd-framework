# 04 - Dependencies audit

Read-only audit of the `dependencies` pillar, CVEs, license compliance, outdated packages, and supply-chain integrity. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `dependencies` findings, written to `dependencies.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Use the appropriate dependency scanner. Stay in this pillar: application-code security belongs to `03-security`, runtime cost to `05-performance`.
   - **Known CVEs**: run `npm audit`, `pip-audit`, `cargo audit`, or the equivalent for the project's package manager. When no scanner or lockfile is present, record "scanner absent" or "no lockfile found" in `Coverage > Skipped` and do not guess CVEs.
   - **License compliance**: check declared licenses against the project's accepted-license list. Flag GPL/AGPL or unknown licenses in a commercial codebase.
   - **Outdated packages**: identify packages significantly behind their latest stable release, especially those with security-relevant changelogs.
   - **Unused declared dependencies**: flag packages listed in the manifest with no import found in the scanned source.
   - **Lockfile integrity and supply chain**: verify the lockfile is present and committed. Flag direct git or URL dependencies and any package with no integrity hash.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line` in the manifest or lockfile. The category is always `dependencies`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `dependencies`, a concrete `file:line`, and an effort.
- Coverage lists `dependencies` as scanned, and no code was changed.
