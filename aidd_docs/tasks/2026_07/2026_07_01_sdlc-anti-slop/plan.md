---
objective: "SDLC artifacts stop emitting slop: every template section states what qualifies it and omits when nothing does, gates live only in /assert, the review traces the plan's phases as checkboxes."
status: pending
---

# Plan: SDLC anti-slop hardening

## Overview

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| **Goal**   | Cut the telling-what-to-do, tighten the output contract, so artifacts stay skimmable.  |
| **Source** | Brainstorm 2026-06-30 (Alex's SDLC run: weak decisions, fake acceptance criteria, useless wireframe, unreadable review). |

## Pivot

Two axes were conflated. Separate them:

- **How the agent works** (process, steps) => loosen, cut. This is Steinberger: describe the behavior, not the steps.
- **What it emits** (templates, assets) => constrain hard.

"Cut more" means cut the instructions, not the structure. The root cause of every slop item: a template with empty slots that the agent fills anyway. Fix = each section states its qualify-if bar and omits when nothing meets it.

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | Root rule: behavior over instructions        | [`phase-1.md`](./phase-1.md) |
| 2   | Gates single-home + SDLC assert step         | [`phase-2.md`](./phase-2.md) |
| 3   | Spec: done-when as observable conditions      | [`phase-3.md`](./phase-3.md) |
| 4   | Plan + phases anti-slop                       | [`phase-4.md`](./phase-4.md) |
| 5   | Review redesign: trace phases, checkboxes     | [`phase-5.md`](./phase-5.md) |

## Resources

| Source        | Verified                    |
| ------------- | --------------------------- |
| `plugins/aidd-context/skills/04-skill-generate/references/skill-authoring.md` | Rules live as R1..Rn here; every generator reads it. Home for the Steinberger rule. |
| `plugins/aidd-dev/skills/03-assert/SKILL.md` | Already the gate: "returns a pass or fail verdict", fix-loop until green. Runs the project's coding assertions. |
| `plugins/aidd-dev/skills/00-sdlc/SKILL.md` | Chains spec→plan→implement→review→ship. No assert step: gates would drop if stripped from the plan. |
| `plugins/aidd-dev/skills/01-plan/assets/{plan,phase}-template.md` | Slot templates. `04-plan.md:17` already carries an omit idiom; phase wireframe carries `omit when no UI`. Inconsistent. |
| `plugins/aidd-pm/skills/04-spec/assets/spec-template.md` | Done-when + optional-section suffix `(optional)` already present. |
| `plugins/aidd-dev/skills/05-review/assets/review-template.md` | Prose + Follow-up section; functional axis traces criteria in a table, not the plan's phases. |
| `aidd_docs/memory/coding-assertions.md` | Project's gate commands (build/test/typecheck) — the single home gates belong in. |

## Decisions

| Decision   | Why            |
| ---------- | -------------- |
| Steinberger rule lands in `skill-authoring.md`, not a new central "golden rules" doc | No golden-rules surface exists; every generator already reads this file, so the rule propagates for free. |
| Gates leave the plan for `/assert` + `coding-assertions.md` | One home per fact; the plan becomes 100% behavioral, gates stay mechanical and single-sourced. |
| `00-sdlc` gains an assert step between implement and review | Stripping gates from the plan drops them unless the orchestrator runs `/assert` explicitly. |
| Reuse the existing `<!-- omit when ... -->` idiom for optional sections | The pattern already exists (phase wireframe); inventing HTML-template machinery would be churn. |

## Spec done-when → phase coverage

| Done-when (observable) | Phase |
| ---------------------- | ----- |
| A rule in `skill-authoring.md` states "describe behavior + qualify-if/omit, never slot-fill" | 1 |
| `00-sdlc` runs `/assert` before review; no template restates build/test commands | 2 |
| Spec done-when items are observable conditions, no user-story scaffolding required | 3 |
| Plan decisions are magnitude-only; resources are URLs/files; wireframe omits without UI; no phase-header redirect | 4 |
| `review.md` mirrors the plan's phases as checked/unchecked boxes, ends with a verification line, carries no prose dump or Follow-up | 5 |
