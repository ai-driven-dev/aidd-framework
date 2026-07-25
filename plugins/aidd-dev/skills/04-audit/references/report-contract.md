---
name: report-contract
description: Ordered audit folder, chapter ownership, finding identity, freshness, and synthesis rules.
---

# Report contract

## Folder

`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_audit_<scope>/`

Reuse the same folder when refreshing the same scope on the same day. Never write audit prose outside it.

## Ordered files

| File | Purpose |
| --- | --- |
| `00-summary.md` | Executive verdict, highest-leverage findings, ordered contents |
| `01-scope-and-system-map.md` | Target, resolved sources, exclusions, budget, runtime and independence policy |
| `02-north-star.md` | Product intent versus code |
| `03-rules.md` | Active-rule control matrix and violations |
| `04-memory.md` | Maintained memory versus current usage |
| `05-architecture-and-decisions.md` | Architecture, choice quality, divergence, generality |
| `06-code-hotspots.md` | Material code-quality hotspots |
| `07-tests-value.md` | Test protection and cost |
| `08-security-and-data.md` | Security, privacy, data integrity |
| `09-performance-and-reliability.md` | Performance and operational resilience |
| `10-automation-and-knowledge-infrastructure.md` | Permanent guardrail candidates |
| `11-challenge-ledger.md` | Accepted, rejected, merged, and disputed candidate findings |
| `12-systemic-findings.md` | Cross-pillar root causes |
| `13-prioritized-actions.md` | Risk-ranked remediation and automation sequence |
| `14-coverage-and-unknowns.md` | Scanned, skipped, stale, inaccessible, unknown |

A single-pillar run writes only `01`, its pillar file, and `14`. A standalone full run writes all files and marks `11` as `independence: none` unless a fresh context challenged the shards.

Templates:

- `assets/audit-index-template.md` for `00`
- `assets/audit-scope-template.md` for `01`
- `assets/audit-template.md` for `02` through `10`
- `assets/audit-challenge-template.md` for `11`
- `assets/audit-synthesis-template.md` for `12`
- `assets/audit-actions-template.md` for `13`
- `assets/audit-coverage-template.md` for `14`

## Chapter frontmatter

Every file starts with:

```yaml
---
audit: <scope-slug>
chapter: <number-and-name>
status: complete | partial | skipped | stale
owner: <agent-or-current-context>
last_verified: <yyyy-mm-dd>
sources:
  - <path-or-description>
depends_on:
  - <chapter-or-none>
---
```

## Pillar body

Use `assets/audit-template.md`. Keep exactly:

1. `## Verdict`
2. `## Findings`
3. `## Confirmed strengths`
4. `## Disputes`
5. `## Unknowns`
6. `## Coverage`

Rules additionally include `## Rule control matrix` using the schema in `actions/09-rules-and-principles.md`. Architecture additionally includes `## Decision register` using `actions/11-decisions.md`. Automation additionally includes `## Automation candidates` using `actions/12-automation.md`.

## Finding identity

IDs use a stable pillar prefix and sequence: `NS-001`, `RULE-001`, `MEM-001`, `ARCH-001`, `CODE-001`, `TEST-001`, `SEC-001`, `PERF-001`, `AUTO-001`.

Each finding records:

- priority `P0`, `P1`, or `P2`;
- originating question and criterion;
- evidence kind and reference;
- direct observation and its interpretation;
- material impact, likelihood, and reach;
- confidence `high` or `medium`;
- minimal reproduction or `not-applicable` with reason;
- falsification attempt;
- next action and effort `S`, `M`, or `L`;
- automation candidate or `none`.

- `P0`: plausible severe correctness, security, privacy, data loss, or North Star failure.
- `P1`: material recurring risk, architectural divergence, or expensive friction.
- `P2`: clear leverage with bounded impact. Cosmetic work is omitted.

## Canonical ownership

A finding exists in exactly one pillar file. Summary, challenge, systemic, and action files link its ID; they never copy its full prose.

When a pillar is refreshed, mark dependent synthesis chapters `stale` until regenerated. Preserve stable IDs when the underlying finding remains the same.
