# Review: cli-kaban — AIDD Docs Kanban Viewer

- **Verdict**: changes-requested
- **Diff**: `main...feature/aidd-docs-kanban-viewer`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_19
- **Findings**: 0 critical, 1 warning, 3 minor

## Phases

### Phase 1 — Project bootstrap & tooling

- [x] Install succeeds and produces a lockfile — `pnpm-lock.yaml` present, `node_modules` installed
- [x] Typecheck reports zero errors — `pnpm typecheck` exit 0
- [x] Lint reports zero errors — `pnpm lint` exit 0 (one deprecation info only)
- [x] Build produces `dist/cli.js` starting with a shebang — `dist/cli.js:1` `#!/usr/bin/env node`

### Phase 2 — Domain & application layer

- [x] No raw type → unknown constant; `"plan"` → `"plan"` — `document-type.ts:3`
- [x] No raw status → unknown constant; `"blocked"` → `"blocked"` — `document-status.ts:3`
- [x] `TaskDocument` interface fully typed — `task-document.ts:1`
- [x] Type filter returns only matching documents — `list-task-documents.ts:16`, test passes
- [x] Status filter returns only matching documents — `list-task-documents.ts:17`, test passes
- [x] No filters returns every document unchanged — `list-task-documents.ts:15`, test passes

### Phase 3 — Infrastructure: filesystem repository

- [x] Valid frontmatter → one TaskDocument per file with parsed fields — `filesystem-task-document-repository.ts:45`, test passes
- [x] Missing status field → unknown bucket, no throw — `filesystem-task-document-repository.ts:50`, test + manual
- [x] Malformed YAML (parse failure) → unknown, no throw — `filesystem-task-document-repository.ts:37`, test passes
- [x] No `aidd_docs` dir → empty list — `filesystem-task-document-repository.ts:59`, test passes

### Phase 4 — Presentation: scriptable table command

- [x] Prints one row per doc with name/type/status — `list-command.ts:11`, manual run
- [x] No path → current working directory — `list-command.ts:32`, test + manual
- [x] `--type plan` prints only plan rows — `list-command.ts:33`, manual `--type spec`
- [x] `--status blocked` prints only matching rows — `list-command.ts:34`, manual `--status done`
- [x] Doc missing status printed under unknown bucket — manual run shows `unknown` rows

### Phase 5 — Presentation: interactive kanban board

- [x] One column per distinct status across three statuses — `kanban-board.tsx:15`, manual board frame + test
- [x] Each doc a card under its normalized status column — `kanban-board.tsx:74`, test passes
- [x] Arrow-key input moves selection without throwing — `kanban-board.tsx:44`, test passes
- [x] `board` filtered set equals `list` filtered rows — same use case in `board-command.ts:17`, parity test passes
- [x] Quit key unmounts app, returns to shell — `kanban-board.tsx:45`, test passes

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 | fit | 3 | `filesystem-task-document-repository.ts:39,49-50` | Spec requires a *malformed* `type`/`status` to land in the unknown bucket. `matter(...).data as RawFrontmatter` asserts non-string YAML values are `string`, and `normalizeDocument*` only tests `=== undefined`. A YAML-coerced value (`type: 2026`, `status: 2026-07-19`) passes through unchanged: verified manually, status renders as a JS `Date` string and the doc escapes `--type unknown`. Still surfaced and no crash, so the tested "missing field" criterion passes, but the "malformed" intent is only partly honored. | Guard the raw values as strings before normalizing (bucket any non-string as unknown), or have `normalizeDocument*` return the unknown constant for non-string input; drop the `as`. |
| 🟢 | rot | 4/5 | `list-command.ts:6-9,15-22` vs `board-command.ts:8-11,13-20` | The two commands duplicate the identical options interface plus the repository + use-case construction and `execute(path, { type, status })` wiring. | Extract a small shared factory/helper (e.g. `loadTaskDocuments(path, options)`) in a presentation shared module. |
| 🟢 | fit | 5 | `kanban-board.tsx:34-37,50-57` | Navigation treats the docs as one flat linear array (`documents[selectedIndex]`), so ←/→/↑/↓ all move ±1 through original file order, jumping between visual columns unpredictably rather than the 2D column navigation the wireframe implies. Acceptance criterion ("selection moves without throwing") is met; this is a UX nit. | If desired, index selection per-column and map left/right to column changes and up/down to intra-column moves. |
| 🟢 | conform | 1 | `biome.json:4-9` | `linter.rules.recommended` is deprecated in Biome 2.x (`biome check` emits an info to migrate to `preset`). Non-blocking, lint still exits 0. | Run `biome migrate` or switch `recommended: true` to the `preset` form. |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (23/23)                                       |
| Files checked | src/cli.ts, src/domain/models/document-type.ts, src/domain/models/document-status.ts, src/domain/models/task-document.ts, src/domain/ports/task-document-repository.ts, src/application/use-cases/list-task-documents.ts, src/infrastructure/filesystem/filesystem-task-document-repository.ts, src/presentation/commands/list-command.ts, src/presentation/commands/board-command.ts, src/presentation/components/kanban-board.tsx, plus 6 test files, package.json, biome.json |
| Unchecked     | none |
| Unplanned     | none |
