---
objective: "The kanban feature holds a real hexagon: presentation depends only on injected ports, HTTP transport lives in infrastructure, one domain service decides board columns for every surface, and the CLI reaches the feature through a single public entrypoint."
status: in-progress
---

# Plan: Kanban hexagonal refactor

## Overview

| Field      | Value                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Enforce hexagonal boundaries across `kanban/` and its `cli/` mount, on one unified `ProgressStatus` board semantics |
| **Source** | User request (`/aidd-dev:01-plan`, 2026-08-28) + assessment of `kanban/src` and `cli/src/application/commands/kanban.ts` |
| **Branch** | Stays on the existing `feat/kanban-web-view` — no new branch. `feat/*` PRs target `next`. |
| **Scope**  | Phases 1-7 are the hexagonal-refactor pass. Phase 8 (`interactive --live`) is the deferred "second temps" improvement, run only after 1-7 land. |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | Composition root and the command layer         | [`phase-1.md`](./phase-1.md) |
| 2   | The ink view receives injected dependencies     | [`phase-2.md`](./phase-2.md) |
| 3   | Unified board semantics in the domain          | [`phase-3.md`](./phase-3.md) |
| 4   | HTTP transport to infrastructure and board DTO | [`phase-4.md`](./phase-4.md) |
| 5   | Project path selection in the web transport     | [`phase-5.md`](./phase-5.md) |
| 6   | Frontend renders the server board and the project picker | [`phase-6.md`](./phase-6.md) |
| 7   | CLI boundary hardened around the entrypoint     | [`phase-7.md`](./phase-7.md) |
| 8   | `interactive --live` opt-in watcher refresh     | [`phase-8.md`](./phase-8.md) |

## Resources

| Source                                                                     | Verified                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `plugins/aidd-dev/skills/01-plan/references/plan-status.md`                | Canonical plan lifecycle values: `pending`, `in-progress`, `implemented`, `reviewed`, `blocked` |
| `plugins/aidd-pm/skills/*/assets/*-template.md`                            | Seed statuses: epic/story/task `proposed`, spike `open`, defect `reported` (no full lifecycle documented) |
| `plugins/aidd-orchestrator/skills/02-backlog/references/events.md`         | End-of-life events `supersede` / `cancel` exist but are not named as statuses                |
| `cli/aidd_docs/memory/architecture.md`, `cli/.claude/rules/00-architecture/*` | CLI is 3-layer hexagonal, deps assembled in `deps.ts`, adapters never instantiated in command files |

## Decisions

| Decision                                                                                              | Why                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Board columns are the five fixed `ProgressStatus` buckets for every surface (CLI table, ink, web) | Literal-status columns break on real data (too many, inconsistent). One derivation removes three divergent implementations.                     |
| Raw status maps: `pending\|proposed\|open\|reported → todo`; `implemented\|reviewed\|done → done`; unmapped (incl. `superseded`, `cancelled`) → `unknown` | The framework only documents the plan lifecycle fully. Seed statuses are known; end-of-life vocabulary is not, so it falls to `unknown` rather than guessing. |
| The `unknown` column renders only when non-empty; the other four always render                    | A permanent empty `unknown` column is noise on healthy projects; hiding the four core columns hides the board's shape.                          |
| One composition root inside `kanban/src`; presentation receives a wired use case and a watcher factory, never `new`s an adapter | Removes the presentation → infrastructure dependency, including the adapter instantiated inside a React `useEffect`.                            |
| `projectPath` is resolved once in `register-kanban` and carried on the runtime; it is not a `KanbanCommandDeps` field (phase 1 for `list`/`web`, phase 2 for `interactive` — it moves with the ink view it is coupled to) | The host passes config only; where the board's root sits is the feature's concern, resolved at one call site instead of three commands.        |
| The DI seam lands in two phases — command layer (1) then ink view (2) — before any behaviour change | Phase 1 alone touches ~18 `new Filesystem*` sites plus the cli consumer; splitting keeps each phase's test rewrite reviewable and green.         |
| Live refresh in the ink view is opt-in behind `interactive --live` (phase 8), not the default; `web` stays always-live | The current ink view is fetch-once; making it always-live is a behaviour change. The `TaskDocumentWatcher` port and `createKanbanRuntime.createWatcher` factory are shared by `web` and the future `--live` flag. |
| Web view targets any project path: `aidd kanban web <path>` pins the path and hides the picker; bare `aidd kanban web` seeds `cwd` and the frontend shows a free-form project-path field | The CLI stays authoritative when it launches the server; a browser-only user needs to re-point the board without restarting. Changing the path re-scans and re-targets the watcher. |
| The browser may `POST` an arbitrary absolute path; the server accepts only paths that contain the docs directory, else a translated 400 | Localhost single-user dev tool, path traversal is not the threat model. The docs-dir check is a fail-fast usability guard, not a security boundary. |
| `TaskDocumentWatcher` gains `retarget(path)`, `TaskDocumentRepository` gains `projectExists(path)`; both are ports, implemented in the filesystem adapters | A runtime project switch needs the file watch to follow, and the picker needs a cheap validity check before re-pointing. |
| HTTP server, SSE manager and frontend-asset reading move to `kanban/src/infrastructure/`          | An HTTP listener and `readFileSync` are I/O at the boundary; `presentation/web/` was infrastructure in disguise.                               |
| A `BoardDto` is the contract for HTTP responses and `list --json`; the use case still returns domain objects | Domain entities (and future domain fields) stop leaking to the browser and to scripts. `--json` output shape changes; the command is hidden/experimental. |
| The filesystem repository returns project-relative paths                                          | The document's identity within the project is relative; no machine-specific absolute path enters the domain, so the DTO needs no path rewrite. |
| `cli/` reaches the feature only through `kanban/src/index.ts`; a grep gate forbids deeper imports  | Replaces four `../../../../kanban/src/presentation/...` imports with one public surface, without extracting a published package (explicit non-goal). |
