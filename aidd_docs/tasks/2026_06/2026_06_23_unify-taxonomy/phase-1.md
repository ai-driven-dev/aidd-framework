---
status: done
---

# Instruction: Canonical routing table

Part of [`plan.md`](./plan.md). Dependency root — author before all other phases.

## Architecture projection

```txt
aidd_docs/memory/
└── vcs.md   🔁  Branch-Naming "Types" table gains 2 columns (triage label,
                 routing ✓/-) + a strict routing callout + a triage-only note.
```

## Tasks to do

### `1)` Replace the branch "Types" table with the dense canonical table

> One grid that maps kind → prefix → commit type → triage label → destination.

1. Under `## Branch Naming Convention` → `### Types`, replace the current 4-column table with:

   | Kind | Branch prefix | Commit type | Triage label | `next` | `main` |
   | ---- | ------------- | ----------- | ------------ | :----: | :----: |
   | Feature | `feat/` | `feat` | `enhancement` | ✓ | – |
   | Fix | `fix/` | `fix` | `bug` | ✓ | – |
   | Docs | `docs/` | `docs` | `documentation` | ✓ | – |
   | Refactor | `refactor/` | `refactor` | – | ✓ | – |
   | Chore | `chore/` | `chore` | `dependencies` | ✓ | – |
   | Test | `test/` | `test` | – | ✓ | – |
   | Hotfix | `hotfix/` | `fix` | `bug` | – | ✓ |

2. Keep the existing `### Format` and `### Examples` blocks unchanged.

### `2)` Add the strict routing callout + triage-only note

> Make the rule unmissable and kill the label/route confusion.

1. Immediately under the table, add a short callout, in substance:
   - The branch **prefix alone** decides the PR target — not a label, not a board field.
   - Everything batches on `next`; **only `hotfix/*` targets `main`** (urgent production fix, out of cycle).
   - The `aidd-vcs:02-pull-request` skill reads this table to set the base branch automatically.
2. Add the triage-only note: labels categorize, they never route; `security` is cross-cutting — add it to any kind when the change is security-sensitive.
3. Confirm the commit-type and changelog definitions are untouched (the `## Commit Convention` section stays as-is; the table's "commit type" column is illustrative, not a redefinition).

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | The dense 6-column table renders in `vcs.md`; exactly one row routes to `main` (`hotfix`); all others to `next`. |
| 1 | The table is the only place in the repo with the kind·prefix·label·✓/- grid (`grep -rl` for a unique cell string returns only `vcs.md`). |
| 2 | A "routing rule (strict)" callout states prefix-decides-target and the single `hotfix→main` exception; a triage-only note is present. |
| 2 | `## Commit Convention` section is byte-identical to before (no commit-type or scope changes). |
