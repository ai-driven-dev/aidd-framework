---
objective: "01-ticket-info, 03-prd, and 04-spec routers match the aidd-pm contract (07-epic shape): references/ hold every rule an action doesn't, TBD: has one spelling in one file, and the PRD sections live only in prd-template.md."
status: in-progress
---

# Plan: Migrate ticket-info, PRD, spec to the router contract

## Overview

| Field      | Value                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | Bring the 3 remaining `aidd-pm` skills in line with the other 7: mermaid flow, `\| Action \| Does \|` table, canonical lead-in, no `## Assets`, one rule one home. |
| **Source** | GitHub issue #564 (ai-driven-dev/framework)                            |

Each phase migrates exactly one skill. Stop after each phase for interactive review before starting the next — explicit user instruction, not the default.

## Phases

| #   | Phase                          | File                          |
| --- | ------------------------------- | ------------------------------ |
| 1   | Migrate `01-ticket-info`        | [`phase-1.md`](./phase-1.md)  |
| 2   | Migrate `03-prd`                | [`phase-2.md`](./phase-2.md)  |
| 3   | Migrate `04-spec`               | [`phase-3.md`](./phase-3.md)  |

## Resources

| Source                                                                     | Verified                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GitHub issue #564                                                          | Scope, acceptance criteria, and the two corrected claims (argument-hint, `## Test` shape).    |
| `plugins/aidd-pm/skills/07-epic/*`                                         | Reference migration: router mermaid + `\| Action \| Does \|` shape, references/ split, canonical lead-in wording. |
| `plugins/aidd-context/skills/04-skill-generate/references/skill-authoring.md` | The contract, R1-R19, per artifact (skill, router, action, reference, asset).                |
| `plugins/aidd-context/skills/04-skill-generate/assets/{skill,action}-template.md` | Exact canonical lead-in text and section order/frontmatter shape.                        |
| Direct read of all 3 target `SKILL.md` + `actions/*.md`                    | Confirmed every duplication the issue names, and the exact 3 spellings of `TBD:` in `04-spec`. |

## Decisions

| Decision                                                                 | Why                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `TBD:` marker's one home is `04-spec/references/tbd-marker.md`, not a shared cross-skill reference | All 3 `TBD:` sites (`SKILL.md`, `01-build.md`, `02-refine.md`) live inside `04-spec`; this codebase doesn't share reference files across skills. |
| Every one of the 3 skills gets at least one named `references/` file — `01-ticket-info/references/tool-detection.md`, `03-prd/references/save-path.md`, `04-spec/references/tbd-marker.md` — not an optional folder | Issue Scope states it as a requirement ("Give each of the three a `references/` folder"), not a suggestion. |
| `01-ticket-info` and `03-prd` keep `## Transversal rules` thin (one line, or the skill-wide read-only/validation-wait constraint) rather than empty | The reference file absorbs the process-shaped duplication; what's left is genuinely skill-wide, not action-owned. |
| `04-spec`'s build-vs-refine dispatch moves into the mermaid as two entry nodes, not prose | R7: a branch stated in prose is a branch missing from the flow; R17: one fact, one home. |
| One phase per skill, review gate between phases                          | User-requested; keeps each migration independently verifiable against the shape criterion. |
| Verify AC#1 (section order, all 10 skills) and AC#5 (every plugin asset filled) in phase 3, not a separate phase | Both criteria span skills beyond any single phase's scope; checking them after the last migration is cheaper than a 4th review-gated phase. |
| AC#5's "filled by an action" reads as "consumed by a named action" — a template is filled, a validator/checklist is read against | `spec-validator.yml` is read, never written; the issue's actual named defect is `task-template.md` being cited by nothing at all. Resolving the reading now avoids relitigating it mid-phase-3. |
| Each of the 3 new `references/*.md` files stays a single file per skill, not split further | R19: split a path only when it needs one fact without the other. `tool-detection.md`'s two facts (tool source, identifier format) and `save-path.md`'s one fact are both consumed by the same single action's process — no path needs one without the other. |

## Correction

The issue's own arithmetic doesn't match the repo: "Eight `aidd-pm` skills follow the router contract. Three never migrated" (= 11) and AC#1 "the eleven `aidd-pm` routers" both assume 11 skills. `plugins/aidd-pm/skills/` holds 10 (`01`-`10`). 7 already match the contract (`02,05,06,07,08,09,10` — confirmed identical heading sequence, mermaid, and canonical lead-in against `07-epic`), plus the 3 this plan migrates = 10, not 11. Same category of error as the two claims the issue itself already corrected under "What already landed". Flagged for the user in phase 3, not silently resolved.
