---
name: 04-audit
description: Audit a codebase read-only across six engineering pillars plus delegated UI experience review. Use when the user wants to assess, health-check, or audit a codebase or one pillar. Not for fixing findings, reviewing a change, or checking a feature works.
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
| 07  | `ui`           | ui           | Delegate experience diagnosis to a discovered UI review capability   |

Run the one pillar named, or offer all seven when the request is unscoped.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Read-only: diagnose and rank, never edit code.
- Scope: run the one named pillar, or for an unscoped request ask once "all seven pillars, or one?" before running. Never silently default to one pillar, never blind-run all without offering the choice.
- One folder per run, `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_audit/`, like a feature folder. Every engineering pillar that runs writes its own `<pillar>.md`; delegated UI review keeps its provider-owned report. A full run additionally writes `report.md`: one merged engineering Findings table, one Top-actions list, Coverage over all seven pillars, and a reference to the separate UI report when available.
- Unscannable pillar: skip it, record it under `Coverage > Skipped` with the reason, and never invent findings for it.
- Every engineering finding row carries a severity, its pillar, a concrete `file:line`, the issue, a suggested fix, and an effort. Delegated UI findings retain the UI provider schema and are never converted into engineering rows.

## Assets

- `assets/audit-template.md`: the report structure both run modes fill.
