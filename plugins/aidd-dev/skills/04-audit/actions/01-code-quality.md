# 01 - Code hotspots

Find the few code structures that impose disproportionate correctness or change cost. Read-only.

## Input

Target, optional scope, and resolved sources from `01-scope-and-system-map.md`.

## Output

`06-code-hotspots.md`, following `../assets/audit-template.md`.

## Questions

- Which files or functions are abnormal relative to project siblings in size, complexity, churn, dependencies, or responsibility?
- Which duplicated paths, dead branches, vestigial flags, or swallowed errors create material risk?
- Which abstraction makes a common change touch unrelated areas?
- What feels clever rather than clear, and does evidence show a consequence?

## Process

1. Read `../references/audit-contract.md`, `../references/question-protocol.md`, and the Code hotspots pack in `../references/question-packs.md`.
2. Build a cheap hotspot map with repository search and available static tools. Prefer relative outliers over universal line-count thresholds.
3. Inspect call sites, imports, error paths, and current change surfaces for the strongest leads.
4. Falsify each lead: a large generated table or cohesive module is not a finding merely because it is large.
5. Report at most five verified root problems. Architecture coupling belongs to `02`; runtime cost belongs to `05`.

## Test

- Every finding proves a material consequence beyond file size or personal style.
- No dead code is asserted without call-site or tooling evidence.
- `06-code-hotspots.md` has the required sections and at most five findings.
- Application files are unchanged.
