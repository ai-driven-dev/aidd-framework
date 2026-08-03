---
objective: "Order status columns by this project's own plan lifecycle (pending, in-progress, implemented, then any other literal status), and give a generic parent title (plan/master-plan/spec with no `name`) a distinctive fallback drawn from its containing task folder's name instead of its own generic filename."
status: implemented
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: cli-kaban — Status Column Ordering & Folder-Name Title Fallback

## Overview

| Field      | Value                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Fixed, meaningful column order for the interactive view and `list` export; a distinctive title for `plan`/`master-plan`/`spec` documents that have no `name`, drawn from their own task folder instead of their always-generic filename |
| **Source** | User request (text) + screenshot of `cli-kaban — interactive`, cross-checked against the real `firstId` project's `aidd_docs` and this framework's own `plan-template.md` |

## Phases

| #   | Phase                                              | File                         |
| --- | ---------------------------------------------------- | ----------------------------- |
| 1   | Canonical status column ordering                     | [`phase-1.md`](./phase-1.md) |
| 2   | Folder-name fallback for plan/master-plan/spec        | [`phase-2.md`](./phase-2.md) |

## Resources

<!-- External sources only (URLs, docs), not code files. Omit if none consulted. -->

| Source                                                                                        | Verified                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/projects/firstId/aidd_docs` (the real project behind the screenshot)                        | No subfolder nesting exists anywhere. The IN-PROGRESS mega-group is every loose, non-foldered `.md` sitting directly under `tasks/2026_07/` colliding into one directory-based group; the repeated "plan" titles are every proper task folder's own `plan.md`, all missing `name` |
| `plugins/aidd-dev/skills/01-plan/assets/plan-template.md` (this framework's own plan scaffold) | Frontmatter is `objective` + `status` only — `name` is never part of the schema, so every `plan.md` this framework generates is missing it by construction, not by omission                                                     |
| This repo's own `spec.md`                                                                       | Has no frontmatter block at all — the same systematic absence of `name` applies to `spec.md` as to `plan.md`                                                                                                                     |

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision                                                                                                                    | Why                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order columns by this project's own documented plan lifecycle (`pending → in-progress → implemented → reviewed → blocked`), appending any other literal status afterward in first-seen order | Literal status is free text and can't be fully enumerated, but these five values are the ones this exact framework already assigns meaning to (`00-sdlc`'s plan-status lifecycle); no new convention needed |
| For `plan.md`/`master-plan.md`/`spec.md` missing `name`, fall back to the containing task folder's name, unconditionally — no directory-depth check involved | These three templates never define a `name` field at all, so the file's own basename ("plan"/"spec") is always identical across every task and carries zero distinguishing information; the folder name is the one thing always unique per task |
| Any other document missing `name` (`phase-1.md`, loose docs like `2026_07_07-infra-fid559-reconciliation.md`, ...) keeps falling back to its own filename, unchanged | Those filenames are already distinct from their siblings; only the fixed `plan`/`master-plan`/`spec` trio is systematically generic |
| The "mega-group" found in `firstId` (every loose `.md` directly under `tasks/<yyyy_mm>/`, with no per-task subfolder, colliding into one directory-based group) is left untouched by this plan | Confirmed as a special, already-recognized case (legacy loose-file style, not the supported `tasks/<yyyy_mm>/<slug>/` convention) — not worth engineering for here; a future plan can decide how loose files should be handled, if ever |
