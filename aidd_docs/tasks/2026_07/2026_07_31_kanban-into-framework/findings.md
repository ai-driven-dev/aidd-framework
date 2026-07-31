---
name: kanban-real-world-findings
description: What `aidd kanban` actually shows when run against real aidd_docs folders
type: findings
status: done
---

# Phase 3 — What the tool shows on real projects

Run against four projects on 2026-07-31, with the built `dist/cli.js`.

| Project        | Markdown files | Literal status columns                                            |
| -------------- | -------------- | ------------------------------------------------------------------ |
| `framework`    | 67             | `pending`, `in-progress`, `implemented`, `reviewed`                 |
| `cli`          | 164            | `in-progress`, `implemented`, `draft`, `done`, `findings-1-2-done`  |
| `kairos-app`   | 259            | `in-progress`, `implemented`, `read-only — diagnose only, no fixes` |
| `breathflow`   | 10             | none — prints "No task documents found."                            |

## Defect found and fixed

Every filter was silently dead through `aidd kanban`. `--type`, `--status`, `--progress` and `--all` changed nothing: `aidd kanban list ../cli --status draft` printed all five columns.

Cause: both views declare the same option names, and the interactive one was mounted directly on the `kanban` command. Commander then binds `--status` to the parent, and the `list` subcommand's own option resolves to `undefined`. Isolated with a five-case probe: the shadowing depends only on the parent declaring the same option name, not on it having an action or an argument.

Fix: the interactive view gets its own `interactive` subcommand marked `isDefault`, so `aidd kanban [path]` still lands on it and each view owns its options. Verified across all five invocation shapes, then against real data — `--status draft` now yields one column, `--all` reveals `breathflow`'s ten documents.

Kanban's own suite never caught this: its tests mount the register functions on a bare root command, where no parent exists to shadow anything. Nothing tests the wiring as it is actually mounted under `aidd`.

## What the tool shows

**The board overflows vertically with no way to scroll.** On `cli`, at 190x45, the rendered frame is 44 lines below the header — the top of the board is already off-screen, and `↑/↓` moves a selection the user cannot see. Scrolling was an explicit non-goal of the second iteration. At 164 documents it stops being a non-goal and starts being the main obstacle.

**Literal status values are not a usable column key at scale.** `cli` produces a `findings-1-2-done` column, and `kairos-app` a column headed `read-only — diagnose only, no fixes` — a full sentence someone wrote in a `status:` field. The literal-status decision was sound on a clean backlog; on three real ones it yields columns that mean nothing to anyone.

**The name fallback only rescues parents.** In `cli`, one cell holds `- plan: unknown` six times plus `- master_plan: unknown`. `resolveTaskDocumentNameFallback` maps a generic `plan.md` to its folder name only when that file is elected parent; as a sub-document it keeps its generic basename, so the display is indistinguishable rows.

**`--type` is near-useless against this framework's own documents.** `aidd kanban list ../cli --type plan` returns nothing. The plan template defines `objective` and `status` only, never `type`, so every plan this framework generates buckets as unknown.

**A project with documents can look empty.** `breathflow` has ten markdown files and prints "No task documents found." They have no frontmatter, so they land in the unknown bucket, which is hidden unless `--all` is passed. Nothing in the output mentions `--all` exists.

**The loose-file mega-group is visible in this very repo.** `framework`'s board shows a group titled `phase` holding `- plan: unknown`, plus a group with an empty name. These are loose files directly under `tasks/<yyyy_mm>/` colliding into one directory-based group — the case Francois identified and deliberately left alone.

## What this leaves for the product conversation

- Vertical scrolling moves from non-goal to the first question.
- Whether the column key stays the literal status, or normalizes, or becomes user-configurable.
- Whether sub-documents deserve their own name fallback, or whether nesting should collapse at scale.
- Whether the unknown bucket should be hidden by default at all, and what an empty board should say.
- Whether `--type` survives, given the framework's own templates never emit the field it reads.
