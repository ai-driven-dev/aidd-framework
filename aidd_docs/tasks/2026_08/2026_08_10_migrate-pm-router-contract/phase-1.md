---
status: done
---

# Instruction: Migrate `01-ticket-info` to the router contract

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── plugins/aidd-pm/skills/01-ticket-info/
    ├── SKILL.md                          ✏️ mermaid flow, `| Action | Does |` table, canonical lead-in; drop the `| # | Action | Role | Input |` shape and duplicated process rules
    ├── actions/01-ticket-info.md         ✏️ cite references/ and assets/ instead of restating rules and output fields
    ├── references/                       ✅ create — issue scope mandates a references/ folder on every one of the 3 skills
    │   └── tool-detection.md             ✅ create — where the configured ticketing tool and identifier convention are declared
    └── assets/
        └── ticket-template.md            ✅ create — standardizes the display fields (title, status, assignee, priority, URL, description); user-requested during phase review, not in the original issue scope
```

## Tasks to do

### `1)` Rebuild the router

> Router keeps only the flow, the action table, and whatever rule truly belongs to no single action or reference (R6, R9, R10).

1. Add a mermaid `flowchart LR`: one entry node (ticket id or branch-derived id) → `ticket-info` → terminal node (displayed ticket). Single action, no loop.
2. Replace the `| # | Action | Role | Input |` table with `| Action | Does |`: bare slug `ticket-info`, lowercase imperative half-line, no trailing period (R8).
3. Replace "Before running an action, read its file in `actions/`, not only the table or assets." with the canonical lead-in: "Run the flow above. Read only the next action file." (matches `07-epic`, `skill-template.md`).
4. Compare each line under `## Transversal rules` against `actions/01-ticket-info.md`'s `## Process` steps 1-3: every rule already stated there is deleted from the router, not restated (R17).
5. Drop the line repeating the frontmatter `Not for` list / intent — `description` already carries it (R3).

### `2)` Create `references/tool-detection.md`, decide the rest

> Issue Scope is explicit: "Give each of the three a `references/` folder." Not optional — this is the one reference file this skill gets.

1. Create `references/tool-detection.md`: a table or list stating where the configured ticketing tool is declared (project memory first, otherwise repo configuration or environment) and the identifier-format convention (branch-derived id, project prefix/separator/casing) — the two facts that are lookup-order-shaped, not process-shaped (R15).
2. Cite it from the action's `## Process` steps 1 and 3 with a relative link (R14, R18) — delete the equivalent prose from the router's `## Transversal rules` once cited, don't keep both (R17).
3. Check whether "read-only: never create, comment, transition, or reassign" states something the frontmatter `description`'s `Not for` clause doesn't already cover. If it's pure duplication, delete it; otherwise it's the one line that stays in `## Transversal rules` (it governs the whole skill, not one process step).

### `3)` Create `assets/ticket-template.md`

> User-requested during phase review: standardize the display output. Checked first whether `aidd-orchestrator:01-sdlc` (the known caller, `references/01-frame.md:15-16`) needs a specific shape — it consumes `$resolved_source` as free text, no schema, so this is a display-consistency choice, not an external contract requirement.

1. Create `assets/ticket-template.md` with the fields the action already outputs: title, status, assignee, priority, URL, description. Follow the existing template idiom (leading HTML comment instructing fill-and-strip, bracketed placeholders — see `spec-template.md`, `epic-template.md`).
2. Cite it from the action's `## Output` and the `## Process` "Display" step (R18) instead of enumerating the fields inline.
3. Do not add a router `## Assets` section — R6 forbids it; the citation lives in the action, same as every other asset in the plugin.

### `4)` Verify the action still stands alone

> The action file must state everything needed to run, citing references and assets rather than depending on the router.

1. Re-read `actions/01-ticket-info.md`: confirm it states, on its own plus its citations, everything needed to run — no missing step because the router used to cover it.
2. Confirm each citation sits in the sentence that uses it (R18), not as a standalone line.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | `SKILL.md` has a mermaid flow, a `\| Action \| Does \|` table, and the exact canonical lead-in sentence. |
| 1    | No line in `## Transversal rules` duplicates a `## Process` step in `actions/01-ticket-info.md`, nor the frontmatter `description`. |
| 2    | `references/tool-detection.md` exists, is cited from `actions/01-ticket-info.md`, and states a fact no action process step restates. |
| 3    | `assets/ticket-template.md` exists, is cited from `actions/01-ticket-info.md`, and `SKILL.md` has no `## Assets` section. |
| 4    | `actions/01-ticket-info.md` read together with its cited reference and asset fully describes how to run the action, with nothing left only in `SKILL.md`. |
