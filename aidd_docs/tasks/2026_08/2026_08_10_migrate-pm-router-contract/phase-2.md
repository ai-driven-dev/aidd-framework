---
status: pending
---

# Instruction: Migrate `03-prd` to the router contract

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── plugins/aidd-pm/skills/03-prd/
    ├── SKILL.md                          ✏️ mermaid, `| Action | Does |`, canonical lead-in, drop `## Assets`, drop duplicated rules
    ├── actions/01-prd.md                 ✏️ absorb the `## Assets` note; stop naming individual sections, cite the template instead
    ├── assets/prd-template.md            — unchanged, stays sole source of truth for the 8 sections
    ├── assets/task-template.md           ❌ delete — unfilled, collides by name with 10-task's real Task template
    └── references/                       ✅ create — issue scope mandates a references/ folder on every one of the 3 skills
        └── save-path.md                  ✅ create — the dated save-path convention and folder-reuse rule
```

## Tasks to do

### `1)` Delete the dead asset

> Nothing fills `task-template.md`; `01-prd.md` only ever fills `prd-template.md`.

1. Delete `assets/task-template.md`.
2. Remove the `## Assets` section's line announcing it (falls out with task 2's `## Assets` removal anyway — do this first so nothing else references it in the interim).

### `2)` Rebuild the router

1. Add a mermaid `flowchart LR`: one entry node (feature description, optionally with user stories) → `prd` → terminal node (saved PRD). Single action, no loop at router level — the internal draft/validate/re-show cycle stays inside the action's own `## Process` (R12: a loop back inside one action is a dash sub-item of its step, not a router-level back-edge).
2. Replace the `| # | Action | Role | Input |` table with `| Action | Does |`.
3. Replace the lead-in with the canonical sentence: "Run the flow above. Read only the next action file."
4. Delete `## Assets` entirely (R6 forbids it; the remaining asset, `prd-template.md`, is cited from the action instead).
5. Compare each `## Transversal rules` line against `actions/01-prd.md`: "focus on what/why", "sections stay concise", "wait for explicit validation" — all 3 already stated (or belong) in the action's Process/Output — delete from the router.

### `3)` Stop enumerating PRD sections outside the template

> Issue: the 8 sections are named twice — once in `prd-template.md`, once in prose in `01-prd.md:16`. `SKILL.md:25` already declares the template the source of truth; that declaration is the fact that survives, everything else cites it.

1. In `actions/01-prd.md` step 2 ("Draft"), stop spelling out "overview, problem statement, goals, non-goals, user stories, acceptance criteria, dependencies, open questions" inline. Replace with a citation to `assets/prd-template.md` and state only "fill every section the template defines."
2. Move "save path: `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`" and "source of truth for structure: `assets/prd-template.md`" out of the router — both already appear (or belong) in `01-prd.md`'s `## Output`/`## Process`; keep one instance, delete the other (R17).
3. Confirm acceptance criterion "adding a section to `prd-template.md` requires no other edit" holds: grep the skill folder for any other place the 8 section names are spelled out; there should be none left.

### `4)` Create `references/save-path.md`, decide the rest

> Issue Scope mandates a `references/` folder on every one of the 3 skills. The save-path convention is the fact that's list-shaped, not process-shaped (R15).

1. Create `references/save-path.md`: states the dated path pattern (`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`) and the rule to create the month directory when missing.
2. Cite it from `actions/01-prd.md`'s `## Output` line and `## Process` step 4 ("Save") with a relative link (R14, R18); delete the router's "Save path: ..." line once cited (R17).
3. Apply the same test as phase 1 to the remaining lines: "focus on what/why", "sections stay concise", "wait for explicit validation" — if each is already stated in `01-prd.md`'s Process/Output, delete the router copy. If nothing survives, omit `## Transversal rules`.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 1    | `assets/task-template.md` no longer exists; nothing in `SKILL.md` or `actions/01-prd.md` references it.       |
| 2    | `SKILL.md` has a mermaid flow, `\| Action \| Does \|` table, canonical lead-in, and no `## Assets` section.      |
| 2    | No `## Transversal rules` line duplicates a step or output line in `actions/01-prd.md`.                       |
| 3    | The 8 PRD section names appear in exactly one file: `assets/prd-template.md`.                                 |
| 3    | Adding a 9th section to `prd-template.md` requires editing no other file to stay accurate.                     |
| 4    | `references/save-path.md` exists, is cited from `actions/01-prd.md`, and the router no longer states the save path directly. |
