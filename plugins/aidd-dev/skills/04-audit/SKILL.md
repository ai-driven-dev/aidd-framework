---
name: 04-audit
description: Audit current code through a nine-pillar 80/20 core covering North Stars, active rules, memory, architecture and decisions, code hotspots, test value, security, performance, and automation. Use for a broad codebase health-check or one named core pillar. Question-led, static-first, read-only, and evidence-gated.
argument-hint: core | code-quality | architecture | security | performance | tests | north-star | rules-and-principles | memory-and-documentation | decisions | automation
model: opus
---

# Skill: audit

Find the few divergences that matter. Questions expose choices and blind spots; evidence decides whether they become findings. The skill writes audit reports and never changes application code.

## Default profile

`core` is the 80/20 audit. Read `actions/00-core.md`, then the action files mapped below. It writes one numbered chapter per pillar, capped at five high-impact findings except `rules`, which evaluates every active rule.

| File | Pillar | Read |
| --- | --- | --- |
| `02-north-star.md` | Current product intent versus code | `actions/08-north-star.md` |
| `03-rules.md` | Active rules, letter and spirit | `actions/09-rules-and-principles.md` |
| `04-memory.md` | Maintained memory versus current usage | `actions/10-memory-and-documentation.md` |
| `05-architecture-and-decisions.md` | Boundaries, choices, divergence, generality | `actions/02-architecture.md`, `actions/11-decisions.md` |
| `06-code-hotspots.md` | Oversized, complex, duplicated, dead, risky code | `actions/01-code-quality.md` |
| `07-tests-value.md` | Risk protection, signal, redundancy, flake, cost | `actions/06-tests.md` |
| `08-security-and-data.md` | Auth, privacy, integrity, unsafe boundaries | `actions/03-security.md` |
| `09-performance-and-reliability.md` | Slow paths, heavy work, failure modes, observability | `actions/05-performance.md` |
| `10-automation-and-knowledge-infrastructure.md` | Recurring work and permanent guardrails | `actions/12-automation.md` |

Before running a pillar, read every action file named by its row. Before any run, read:

- `references/audit-contract.md`
- `references/question-protocol.md`
- `references/report-contract.md`
- the relevant section of `references/question-packs.md`

## Routing

1. A named pillar runs only that pillar.
2. `core`, an unscoped audit, or a broad health-check runs all nine core pillars.
3. A custom scope or question pack must map to one or more core pillars and records the customisation in `01-scope-and-system-map.md`.
4. The recipe never spawns agents. A caller may run chapters in isolated agents and later populate the same report package.

## Output

Write or refresh:

`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_audit_<scope>/`

A full run uses `00-summary.md` through `14-coverage-and-unknowns.md` per `references/report-contract.md`. A single-pillar run always writes `01-scope-and-system-map.md`, its numbered pillar file, and `14-coverage-and-unknowns.md`.

## Non-negotiable rules

- Current truth only: code, configuration, North Stars, active rules, `aidd_docs/memory/**`, and explicitly current architecture sources.
- Ignore `aidd_docs/tasks/**`, old plans, old reviews, and historical documentation unless the user declares one normative.
- Static-first. Never run a general E2E journey or launch the site as normal audit work.
- One bounded, read-only runtime probe is allowed only for a plausible critical defect that static evidence cannot settle; record the escalation reason.
- No finding from sentiment, naming, coverage percentage, or model recollection alone.
- No cosmetic nits. Prefer five consequential findings to fifty observations.
- Report uncertainty. Missing evidence produces `unknown`, not confidence theater.
- Recurring problems must consider a permanent automation or knowledge-infrastructure response.
