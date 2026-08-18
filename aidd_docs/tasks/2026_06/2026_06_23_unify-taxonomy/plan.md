---
objective: "The change taxonomy + routing rule live in one canonical table (vcs.md); every other surface links to it or derives from it; the board playbook is delivered."
status: implemented
---

# Plan: Unify the change taxonomy into one source of truth + a projected board

## Overview

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| **Goal**   | One canonical routing table; all surfaces link/derive; board playbook. |
| **Source** | [`2026_06_23-unify-taxonomy.md`](../../../specs/2026_06/2026_06_23-unify-taxonomy.md) (spec, VALID 100/100) |

## Phases

| #   | Phase                          | File                         |
| --- | ------------------------------ | ---------------------------- |
| 1   | Canonical routing table        | [`phase-1.md`](./phase-1.md) |
| 2   | Label set + dependabot (atomic)| [`phase-2.md`](./phase-2.md) |
| 3   | Docs point to canonical        | [`phase-3.md`](./phase-3.md) |
| 4   | PR automation routes by prefix | [`phase-4.md`](./phase-4.md) |
| 5   | Board playbook (Project 8)     | [`phase-5.md`](./phase-5.md) |

## Resources

| Source        | Verified                    |
| ------------- | --------------------------- |
| `aidd_docs/memory/vcs.md` | Holds branch table (prefix · from · target) — no label column, no ✓/-. Becomes the dense canonical. |
| `RELEASE.md` | "Where your change goes" has a flow mermaid + commit→changelog table (matches release-please-config). |
| `CONTRIBUTING.md` | Already a hub: links vcs.md (commits L67), RELEASE (routing L71), GOVERNANCE (merge). Inline label table L75-80 is the one duplication. |
| `.github/labels.yml` | 11 labels. |
| `.github/dependabot.yml` | Applies `dependencies`+`npm` and `dependencies`+`github-actions` — must drop in lockstep with labels.yml. |
| `.github/ISSUE_TEMPLATE/bug_report.yml` / `feature_request.yml` | Already carry `labels: ["bug"]` / `["enhancement"]` — done-when "issue born typed" PRE-SATISFIED; verify-only. |
| `plugins/aidd-vcs/skills/02-pull-request/actions/01-pull-request.md` | Base resolution candidate list `main/master/develop/staging` — `next` absent (the feat/→main bug). |
| `docs/MAINTAINERS.md` | Existing maintainer-ops home — proposed host for the board playbook section. |

## Decisions

| Decision   | Why            |
| ---------- | -------------- |
| Canonical table lives in `vcs.md` (AI-auto-loaded memory) | PR skill + AI both read memory; flipping to a human doc would couple automation to a non-loaded file. |
| RELEASE keeps its flow mermaid | A flow diagram ≠ the mapping table; the prefix→target *table* stays single-homed in vcs.md, RELEASE links it. |
| Board playbook appended to `docs/MAINTAINERS.md` | Maintainer-ops already lives there; avoids a new orphan doc (no-sprawl ethos). Confirm fit at implement. |
| Issue templates: no edit | They already apply the Type label; editing would be churn. |
| Plugin `branch.md` / PR action stay generic | Distributable layer (ARCHITECTURE.md); they read project memory, never hardcode `next`. |

## Spec done-when → phase coverage

| Spec done-when | Phase |
| -------------- | ----- |
| Mapping exists once; others link | 1 (author) + 3 (link) |
| Strict: single production-routed row | 1 |
| Front-door routes 3 destinations, one hop | 3 |
| Label set reduced, triage-only, no routing-by-label | 2 |
| Dropped labels not recreated by automation | 2 |
| Issue born typed | pre-satisfied (verify in 3) |
| PR base + label by prefix | 4 |
| Board fields orthogonal (Work type, Phases gone; Priority kept) | 5 |
| Status lifecycle + automation + Timeline view | 5 |
