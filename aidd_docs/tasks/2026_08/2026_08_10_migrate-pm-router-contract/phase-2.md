---
status: done
---

# Instruction: Migrate `03-prd` to the router contract

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── plugins/aidd-pm/skills/03-prd/
    ├── SKILL.md                 ✏️ mermaid (3-node chain), `| Action | Does |`, canonical lead-in, 5+1 Transversal rules, no `## Assets`
    ├── actions/01-prd.md        ❌ delete — split below
    ├── actions/01-draft.md      ✅ create — parse+fill+iterate to approval
    ├── actions/02-finalize.md   ✅ create — save+verify
    ├── assets/prd-template.md   — unchanged, sole source of truth for the 8 sections
    └── assets/task-template.md  ❌ delete — unfilled, collides by name with 10-task's real Task template
```

No `references/` folder. Issue Scope says "give each of the three a `references/` folder", but the only candidate content (the save path, one sentence) isn't reference-shaped — no table, no branching, nothing 04-spec's `tbd-marker.md`-style multi-site drift applies to. The literal AC ("no router states a rule an action or reference could hold") is satisfied either way; inlined into `finalize`'s Process step 1 instead.

## Decisions made during review (deviate from the original phase draft)

- **Split `01-prd` into `draft` + `finalize`.** The 1-action design (parse+draft+validate+save in one file) was measurably more verbose per-action than every comparable migrated skill. Matches `08-three-amigos`'s 2-action, single-responsibility shape. Net behavior unchanged (same approval gate, same output) — action-count restructuring past issue #564's literal "no behaviour change" scope, so flagged here rather than silently absorbed.
- **Added the 5-line shared boilerplate + 1 skill-specific line to `## Transversal rules`.** 6 of 7 already-migrated skills (`02,05,06,07,09,10`) share these 5 lines verbatim; a missed pattern in the first draft.
- **Dropped `affected relations` and `before -> after`** from `finalize`'s report contract — both are copy-pasted from Task/Defect/Epic, neither applies (PRD has no `relations.md`, and always creates a fresh dated file — no update-in-place exists to diff).
- **No `references/persistence.md`.** See above.

## Test acceptance criteria

| # | Acceptance criteria |
| - | -------------------- |
| 1 | `assets/task-template.md` no longer exists; nothing references it. |
| 2 | `SKILL.md` has a mermaid flow, `\| Action \| Does \|` table, canonical lead-in, no `## Assets`, and the 5+1 `## Transversal rules`. |
| 3 | The 8 PRD section names appear in exactly one file: `assets/prd-template.md`. |
| 4 | `draft` never writes to disk; `finalize` only ever receives an already-approved draft. |
| 5 | Live headless run: both actions chain correctly, saved file matches `prd-template.md` exactly (verified). |
