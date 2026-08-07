---
name: 04-audit
description: Audit a codebase read-only across seven quality pillars into one ranked report. Use when the user wants to assess, health-check, or audit a codebase or one pillar. Not for fixing findings, reviewing a change, or checking a feature works.
argument-hint: scope | pillar
model: opus
---

# Skill: audit

Diagnose a codebase against quality pillars and emit one ranked findings report. Read-only: it identifies and ranks problems, never changes code.

## Actions

| #   | Action         | Pillar       | Lens                                                                 |
| --- | -------------- | ------------ | -------------------------------------------------------------------- |
| 01  | `code-quality` | code-quality | Clean code (naming, SOLID, DRY, readability, smells) and tech debt (dead code, complexity, file/function size, error handling) |
| 02  | `architecture` | architecture | Conformance to C4 / ADRs, coupling, boundaries, layering             |
| 03  | `security`     | security     | OWASP risks, authz, input validation, secrets in code                |
| 04  | `dependencies` | dependencies | CVEs, licenses, outdated and unused deps, supply chain               |
| 05  | `performance`  | performance  | N+1 queries, hot paths, bundle size, heavy operations                |
| 06  | `tests`        | tests        | Critical-path coverage, flakiness, test pyramid balance              |
| 07  | `ui`           | ui           | Loading/error/empty states, visual hierarchy, design-system drift, responsive, a11y |

Run the one pillar named, or offer all seven when the request is unscoped.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Read-only: diagnose and rank, never edit code.
- Scope: run the one named pillar, or for an unscoped request ask once "all seven pillars, or one?" before running. Never silently default to one pillar, never blind-run all without offering the choice.
- One folder per run, `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_audit/`, like a feature folder. Every pillar that runs always writes its own `<pillar>.md` there, alone or in a full run. A full run additionally writes a merged `report.md`: one Findings table (category = pillar, severity-first), one Top-actions list, and one Coverage section over all seven pillars.
- Unscannable pillar: skip it, record it under `Coverage > Skipped` with the reason, and never invent findings for it.
- Every finding row carries a severity, its pillar, a concrete `file:line`, the issue, a suggested fix, and an effort.

## Assets

- `assets/audit-template.md`: the report structure both run modes fill.
