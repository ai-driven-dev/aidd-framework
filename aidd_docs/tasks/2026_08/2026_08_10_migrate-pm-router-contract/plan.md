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
| `references/` is per-skill judgment, not mandatory on all 3 | Issue Scope says "give each of the three a `references/` folder", but the literal AC only requires a rule to live in *an action or reference* — not that the folder exist. `01-ticket-info` gets one (`tool-detection.md`, genuinely lookup-table-shaped). `03-prd` doesn't — its only candidate (a one-sentence save path) isn't reference-shaped, inlined into `finalize` instead. |
| `01-ticket-info` ends up with no `## Transversal rules`; `03-prd` gets the 6-line pattern | `01-ticket-info`: every prior line moved to a reference or was a pure duplicate of `description` — real precedent, 8 framework skills ship `## Actions` with no `## Transversal rules`. `03-prd`: 6 of 7 already-migrated skills share 5 verbatim boilerplate lines + 1 skill-specific line — missed in the first draft, restored during review. |
| `03-prd` splits into `draft` + `finalize` (2 actions), matching `08-three-amigos`'s single-responsibility shape | User-requested during phase 2 review: the 1-action design (parse+draft+validate+save) was measurably more verbose per-action than every comparable migrated skill. Net behavior unchanged (same approval gate, same output) but this is action-count restructuring — past issue #564's literal "no behaviour change" scope. Extension flagged, not silently absorbed. |
| `03-prd`'s report contract drops `affected relations` and `before -> after` | Both copy-pasted from Task/Defect/Epic; neither applies — PRD has no `relations.md`, and always creates a fresh dated file (no update-in-place to diff). |
| `04-spec`'s build-vs-refine dispatch moves into the mermaid as two entry nodes, not prose | R7: a branch stated in prose is a branch missing from the flow; R17: one fact, one home. |
| One phase per skill, review gate between phases                          | User-requested; keeps each migration independently verifiable against the shape criterion. |
| Verify AC#1 (section order, all 10 skills) and AC#5 (every plugin asset filled) in phase 3, not a separate phase | Both criteria span skills beyond any single phase's scope; checking them after the last migration is cheaper than a 4th review-gated phase. |
| AC#5's "filled by an action" reads as "consumed by a named action" — a template is filled, a validator/checklist is read against | `spec-validator.yml` is read, never written; the issue's actual named defect is `task-template.md` being cited by nothing at all. Resolving the reading now avoids relitigating it mid-phase-3. |

## Correction

The issue's own arithmetic doesn't match the repo: "Eight `aidd-pm` skills follow the router contract. Three never migrated" (= 11) and AC#1 "the eleven `aidd-pm` routers" both assume 11 skills. `plugins/aidd-pm/skills/` holds 10 (`01`-`10`). 7 already match the contract (`02,05,06,07,08,09,10` — confirmed identical heading sequence, mermaid, and canonical lead-in against `07-epic`), plus the 3 this plan migrates = 10, not 11. Same category of error as the two claims the issue itself already corrected under "What already landed". Flagged for the user in phase 3, not silently resolved.
