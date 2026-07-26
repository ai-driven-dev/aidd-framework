# 00 - Core audit

Run the complete static-first 80/20 audit and assemble the numbered report package. Read-only outside the report folder.

## Input

Optional target, scope, North Star sources, rule sources, memory path, architecture sources, and budget. Defaults come from `../references/audit-contract.md`.

## Output

`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_audit_<scope>/`, containing `00-summary.md` through `14-coverage-and-unknowns.md`.

## Process

1. **Contract.** Read every audit reference and the applicable templates before scanning.
2. **Frame.** Resolve runtime inputs and exclusions into `01-scope-and-system-map.md`.
3. **Investigate.** Run the nine core pillars in the router table and write only their owned chapters.
4. **Challenge.** Recheck every candidate against criterion, observation, interpretation, impact, likelihood, reach, confidence, reproduction, and falsification. Write `11-challenge-ledger.md`. In one context set `independence: none`.
5. **Cluster.** Link supported cross-pillar causes in `12-systemic-findings.md`. Similar wording without a shared cause stays separate.
6. **Prioritise.** Write `13-prioritized-actions.md`, ranking cause-level fixes and automation by impact, likelihood, reach, confidence, and effort.
7. **Close coverage.** Write `14-coverage-and-unknowns.md` with scanned, skipped, stale, inaccessible, and unresolved surfaces.
8. **Summarise.** Write `00-summary.md` last from canonical finding IDs. Never copy full finding prose.
9. **Validate.** Check each document against its section contract in `../assets/audit-validator.yml`; remove placeholders and unsupported claims.
