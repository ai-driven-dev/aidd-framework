---
status: done
---

# Instruction: Migrate `04-spec` to the router contract

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── plugins/aidd-pm/skills/04-spec/
    ├── SKILL.md                    ✏️ mermaid (2 entry nodes: build vs refine), `| Action | Does |`, canonical lead-in, no `## Assets`, own 4-line Transversal rules (not the epic/task/prd boilerplate — spec has no approval gate, doesn't fit)
    ├── actions/01-build.md         ✏️ cite tbd-marker.md, cite spec-template.md (pre-existing gap, was never actually linked), drop before->after/affected relations (always creates fresh, no diff)
    ├── actions/02-refine.md        ✏️ cite tbd-marker.md, fix 2 drifted TBD spellings, keep before->after (legitimate — rewrites in place), drop affected relations
    └── references/
        └── tbd-marker.md           ✅ create — the one canonical `TBD: <precise question>` spelling
```

## Decisions

- **No epic/task/prd Transversal-rules boilerplate.** Checked each of the 5 shared lines against what `build`/`refine` actually do: no approval gate before write, no lifecycle, uses TBD-marking instead of interactive questioning. None of it fits — inventing it would add behavior that doesn't exist. Kept spec's own rules instead (matches `08-three-amigos`'s precedent of not sharing the boilerplate either).
- **Dispatch-by-input moved into the mermaid** as two entry nodes (request/PRD → `build`, spec+findings → `refine`), replacing the router prose that stated the same branch (R7, R17).
- **`before -> after` kept in `refine`, dropped from `build`.** `refine` genuinely rewrites an existing file in place (real diff). `build` always creates a fresh dated file — no prior state exists to diff.
- **Router never cites a reference.** No other router does (checked all 7) — R18 only names Process/Output/Test as valid citation sites. Router states policy in plain words ("Never invent; mark every gap instead of guessing"); the actions cite `tbd-marker.md` where they apply it.
- **`tbd-marker.md` trimmed to the literal string only** (`TBD: <precise question>`, no policy prose) — the policy already lives once in the router; anything more would duplicate it.
- **`build.md`'s Source step split into 2 sub-bullets** (PRD path vs free-form request) instead of one dense sentence; "never explore the codebase" promoted out of it into the router's Transversal rules (applies to both actions, not just Source).
- **`refine.md`'s Output cut to one line**, TBD citation removed from Output (stays in Process step 4 only — was duplicated), added an explicit `Verify` step so `before -> after` reporting has a Process home instead of living only in prose.
- **Two pre-existing gaps fixed while auditing citations, not part of the original scope:** `build.md` never linked `spec-template.md` (called it "the template" in prose only); the router's "reuse the folder when it exists" line was deleted without moving its actual path pattern into `build.md` (first draft), caught by a live headless run hitting the gap itself. Second catch: the fixed version still lost the word "resolve" (search-then-reuse-or-create), reducing it to a same-day-only check — restored the two-outcome framing.
- **Two follow-up issues filed, not fixed here** (behavior changes, out of #564's "no behaviour change" scope): [#625](https://github.com/ai-driven-dev/framework/issues/625) — SDLC's Frame stage never checks `spec-validator.yml` before handing a spec to Deliver. [#626](https://github.com/ai-driven-dev/framework/issues/626) — `spec-template.md` has no `## Open Questions` section, so TBD placement is non-deterministic (confirmed: same feature, two runs, two different placements).

## Plugin-wide verification (AC#1, AC#5 — span all 10 skills, checked here as the last phase)

- All 10 `SKILL.md` files: `# Title` → `## Actions` (mermaid + `| Action | Does |` + canonical lead-in) → optional `## Transversal rules`. Section presence varies only where content is legitimately absent (`01-ticket-info` has none — real precedent elsewhere in the framework, e.g. `aidd-dev:01-plan`), never order.
- Every asset in `plugins/aidd-pm/skills/*/assets/*` is cited from a named action. `spec-validator.yml` is read against, not filled — the "consumed by a named action" reading (see `plan.md` Decisions) covers it.
- **Issue count correction:** issue #564 says "eight follow the contract, three don't" (= 11) and AC#1 says "the eleven routers." The plugin holds 10 skills, not 11 — 7 already matched the contract, 3 migrated here. Reporting this rather than silently treating "eleven" as satisfied.
