---
status: pending
---

# Instruction: Migrate `04-spec` to the router contract

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── plugins/aidd-pm/skills/04-spec/
    ├── SKILL.md                          ✏️ mermaid with 2 entry nodes, `| Action | Does |`, canonical lead-in, drop `## Assets`, drop the `TBD:` rule
    ├── actions/01-build.md               ✏️ cite references/tbd-marker.md instead of restating TBD: <precise question>
    ├── actions/02-refine.md              ✏️ same citation; fix the 2 drifted spellings (bare `TBD` at :11, short `TBD: <question>` at :27)
    ├── assets/spec-template.md           — unchanged
    ├── assets/spec-validator.yml         — unchanged
    └── references/
        └── tbd-marker.md                 ✅ create — the one canonical `TBD:` spelling and rule
```

## Tasks to do

### `1)` Create the `TBD:` marker's one home

> Issue: 3 sites, 3 drifting spellings, no owner. All 3 sites already live inside `04-spec` — resolved during brainstorm as an intra-skill reference, not a cross-skill shared one (this codebase doesn't share references across skills).

1. Create `references/tbd-marker.md`: states the exact literal `TBD: <precise question>`, the rule "never guess, mark the gap instead", and nothing else (R15: one fact per reference).
2. In `SKILL.md`'s `## Transversal rules`, replace the inline "Mark every gap as `TBD: <precise question>`..." line with a citation to the reference (R18) — the rule's text now lives only in `references/tbd-marker.md`.
3. In `actions/01-build.md` step 2 ("Gaps"), replace "Replace any missing required field with `TBD: <precise question>`" with a citation to the reference.
4. In `actions/02-refine.md`: fix `:11`'s bare `` `TBD` `` (Output line) and `:18`/`:27`'s spellings so every occurrence either matches the canonical literal exactly or cites `references/tbd-marker.md` instead of re-typing it.

### `2)` Rebuild the router with a branching mermaid

> R7: the existing dispatch prose ("a spec path with findings runs `refine`; a request or PRD path runs `build`") is a branch — it belongs in the flow, not as router prose (R17: one fact, one home).

1. Add a mermaid `flowchart LR` with 2 entry nodes: one for "request or PRD path" → `build`, one for "spec path + findings" → `refine`. Both converge on a terminal node (`spec.md` written/updated).
2. Delete the "Dispatch by input: ..." sentence from the router prose once the mermaid states it — do not keep both (R17).
3. Replace the `| # | Action | Role | Input |` table with `| Action | Does |`.
4. Replace the lead-in with the canonical sentence: "Run the flow above. Read only the next action file."
5. Delete `## Assets` entirely; `spec-template.md` and `spec-validator.yml` get cited from the actions that use them instead.

### `3)` Sort the remaining `## Transversal rules` lines

> Everything except the `TBD:` rule (moved in task 1) needs a home: stays as genuinely cross-cutting (both `build` and `refine` rely on it), or moves into one action if only one uses it.

1. "The spec holds intent, never implementation..." — used by both actions (both write/rewrite the spec body) → stays a router transversal rule, or becomes `references/spec-shape.md` if it grows past what a router line should hold (R15 vs R9 — keep as a router line unless it's genuinely table/list-shaped).
2. "Keep it readable..." — same test as above.
3. "Output: one `spec.md` in the feature folder... Reuse the folder when it exists." — both actions write to the same path; verify it isn't already stated in both actions' `## Output`. If it is, delete the router copy (R17); if neither states it, it's genuinely transversal and stays.
4. "Immutable once validated: never rewrite a spec that has been locked." — check whether this constraint is enforced/stated anywhere in `02-refine.md`; if not, this is a gap the migration surfaces (not new scope, but flag it rather than silently drop it).

### `4)` Verify the plugin-wide acceptance criteria

> AC#1 ("same shape, sections, **and section order**") and AC#5 ("every asset in the plugin is filled by an action") aren't scoped to one skill — this is the last phase, so it's where they get checked across all 10.

1. For each of the 10 `plugins/aidd-pm/skills/*/SKILL.md`, dump the `^#{1,2} ` heading sequence (`grep -n '^#\{1,2\} '`) and confirm all 10 now agree: `# Title`, `## Actions`, `## Transversal rules`, in that order, nothing else.
2. Enumerate `plugins/aidd-pm/skills/*/assets/*` and confirm each file is consumed by a named action: a template asset is filled (produces the output artifact), a validator/checklist asset is read against (gates the output). `04-spec/assets/spec-validator.yml` is the one checklist-shaped asset in scope — already cited from both `01-build.md` and `02-refine.md` — so it passes under "consumed by a named action", the actual defect AC#5 targets being `task-template.md`'s prior state: cited by nothing at all. State this reading to the user when reporting the phase, rather than re-litigating it live.
3. Report to the user: the issue's own count is off by one (it says "eight follow the contract, three don't" = eleven, and AC#1 says "eleven routers"; the plugin has 10 skills total, so it's seven already-migrated plus three migrated here). Flag this the same way the issue's "What already landed" section already flagged two other wrong claims — don't silently satisfy the literal "eleven".

## Test acceptance criteria

| Task | Acceptance criteria                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | `grep -rn "TBD" plugins/aidd-pm/skills/04-spec/` shows exactly one canonical literal spelling, defined once in `references/tbd-marker.md`, cited (not restated) everywhere else. |
| 2    | `SKILL.md`'s mermaid shows both entry cases (build vs refine); no router prose duplicates the dispatch rule the mermaid now states. |
| 2    | `SKILL.md` has `\| Action \| Does \|`, canonical lead-in, no `## Assets` section. |
| 3    | Every remaining `## Transversal rules` line states a fact no single action's `## Process`/`## Output` already states. |
| 3    | The "immutable once locked" constraint is either confirmed enforced somewhere reachable from `02-refine.md`, or explicitly flagged in the phase review as a pre-existing gap. |
| 4    | All 10 `SKILL.md` heading sequences match exactly (title, Actions, Transversal rules, that order, nothing else). |
| 4    | Every `plugins/aidd-pm/skills/*/assets/*` file is confirmed consumed by a named action (template filled, or validator cited); `spec-validator.yml`'s read-only status is reported to the user as the resolved reading, not asked about. |
| 4    | The "eleven routers" vs. actual 10-skill count discrepancy is reported to the user, not silently absorbed. |
