---
name: audit
description: Codebase audit report template
argument-hint: N/A
---

# Codebase Audit: {{scope}}

{{one_line_summary}}

- **Date**: {{yyyy_mm_dd}}
- **Scope**: {{scope}}
- **Health**: {{good | fair | poor}}
- **Findings**: {{n_critical}} critical, {{n_warning}} warning, {{n_minor}} minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

One row per issue. Every row MUST cite a concrete `file:line`. Sort by severity (critical first). Read-only: an audit reports, it never edits code.

Severity (shared rubric across every audit pillar, so a full audit ranks consistently):
- 🔴 critical - exploitable security hole, data loss, or broken correctness. Fix now.
- 🟡 warning - real debt or risk that will bite later. Fix soon.
- 🟢 minor - nit or cleanup. Fix when convenient.

Effort: `S` (under 1h), `M` (under 1d), `L` (over 1d).
Category (the engineering pillar, one of): `code-quality`, `architecture`, `security`, `dependencies`, `performance`, `tests`. UI experience findings remain in their delegated report because they use a different evidence and priority contract.

| Sev | Category     | Location                  | Issue                                  | Suggested fix                        | Effort |
| --- | ------------ | ------------------------- | -------------------------------------- | ------------------------------------ | ------ |
| 🔴  | security     | `src/api/user.ts:30`      | Request body used without validation   | Validate with the project schema lib | S      |
| 🟡  | code-quality | `src/views/login.tsx:45`  | Toast logic copy-pasted across 3 views | Extract a `useToast` helper          | M      |
| 🟢  | code-quality | `src/legacy/utils.ts:120` | Unused export `formatLegacyDate`       | Delete the function and its imports  | S      |

## Top actions

Highest impact first. Each action names the finding rows it resolves and, when a fix is wanted, the implementation capability to hand off to. The audit itself never edits code.

1. {{action_1}}
2. {{action_2}}
3. {{action_3}}

## Delegated reports

- UI experience: {{project-relative ui-review.md path, unavailable, or not requested}}

## Coverage

Proves each pillar was examined. A pillar with no findings is still scanned and listed here. A pillar that could not be examined (missing tool or runtime) is listed under Skipped with the reason - never silently dropped.

- **Scanned**: {{pillars examined, comma-separated}}
- **Skipped**: {{pillars not examined + reason, or "none"}}
