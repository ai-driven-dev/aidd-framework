# Review: list-status-columns

- **Verdict**: approve
- **Diff**: `505dd23...89114ca25d5dd1252b6115c12f867a850385ac82`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_19
- **Findings**: 0 critical, 0 warning, 2 minor

## Phases

### Phase 1 — Domain: task grouping model

- [x] `plan.md` + two `phase-*.md` group into one `TaskGroup`, plan parent, both phases sub-documents — `src/domain/models/task-group.ts:30-58`, `tests/domain/task-group.test.ts`
- [x] Directory with only `spec.md` elects spec as parent, no sub-documents — `task-group.ts:39-43`
- [x] No recognized filename still yields a group, first document as parent — `task-group.ts:43`
- [x] Documents from different directories never share a group — `task-group.ts:12-28`

### Phase 2 — Fixture-verified frontmatter extraction

- [x] All six fixtures exist under `tests/fixtures/frontmatter/` and parse without throwing — fixtures present, `filesystem-task-document-repository.ts:33-39` swallows malformed YAML
- [x] Suite passes with every fixture's `name`/`type`/`status` individually asserted — `tests/domain/frontmatter-extraction.test.ts` (6 tests pass)
- [x] `body-mentions-status-and-type.md` extracts real frontmatter, not body prose — `tests/domain/frontmatter-extraction.test.ts`

### Phase 3 — Application: grouped, filtered listing

- [x] `execute` returns one `TaskGroup` per directory with its `subDocuments` — `src/application/use-cases/list-task-documents.ts:24-29`
- [x] `--status` excludes a group whose parent doesn't match, even when a sub-document would — `list-task-documents.ts:14`, `tests/application/list-task-documents.test.ts`
- [x] `--progress` still narrows by the parent's normalized bucket, unchanged — `list-task-documents.ts:15-16`

### Phase 4 — Presentation: export command (`list`)

- [x] One column per distinct parent status, headed by that literal status — `src/presentation/commands/list-command.ts:53-72`, `src/presentation/status-grouping.ts:3-13`, `tests/presentation/list-command.test.ts:54-73`
- [x] Sub-documents nested in the same column as plain `- name: status` text — `list-command.ts:22-28`, `tests/presentation/list-command.test.ts:75-91`
- [x] A sub-document's status never moves its parent's column — `status-grouping.ts:15-26`, `tests/presentation/list-command.test.ts:93-111`
- [x] Non-TTY piping still produces a bounded-width table — `list-command.ts:30-47`, `tests/presentation/list-command.test.ts:113-138`
- [x] End-to-end: fixture `name`/`type`/`status` reaches the printed table unaltered — `tests/presentation/list-command.test.ts:238-248`

### Phase 5 — Presentation: interactive command (primary)

- [x] Fixture-backed render shows one column per distinct parent status, sub-documents nested — `src/presentation/components/status-columns-view.tsx:171-221`, `status-column.tsx:13-36`, `tests/presentation/status-columns-view.test.tsx:50-77`
- [x] Narrowing width keeps status header + parent name legible, drops other detail first — `status-column.tsx:14,26-31`, `status-columns-view.tsx:32-39`, `tests/presentation/status-columns-view.test.tsx:79-100`
- [x] No-arg run launches interactive view; `list` still exports — `src/cli.ts:10-11`, `interactive-command.ts:27-40`, `tests/presentation/interactive-command.test.ts`
- [x] End-to-end: fixture data reaches the rendered interactive output unaltered — `tests/presentation/status-columns-view.test.tsx:102-116`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | conform | 4 | `list-command.ts:53-87` | `buildStatusColumnTable` spans 35 physical lines, over CLAUDE.md's "Max 30 lines per function" (grew with the column-paging fix). Borderline: 5 of those are blank lines | Extract the row-assembly loop (74-81) or the sizing setup (60-72) into a helper |
| 🟢 | code-health | 4/5 | `list-command.ts:83-86`, `status-columns-view.tsx:54-75,160-167,197-207` | The two branches added by the fix commit — the export's "N status column(s) not shown" hidden-columns notice and the interactive view's `fetchError`/`FetchErrorMessage` state — have no test exercising them (confirmed: no test references the notice string or the error path) | Add a narrow-terminal test asserting the hidden-columns notice, and a repository-rejection test asserting the error state renders |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (19/19)                                       |
| Files checked | `src/domain/models/task-group.ts`, `src/domain/models/progress-status.ts`, `src/domain/models/task-document.ts`, `src/application/use-cases/list-task-documents.ts`, `src/infrastructure/filesystem/filesystem-task-document-repository.ts`, `src/presentation/commands/list-command.ts`, `src/presentation/commands/interactive-command.ts`, `src/presentation/commands/progress-status-filter.ts`, `src/presentation/status-grouping.ts`, `src/presentation/components/status-column.tsx`, `src/presentation/components/status-columns-view.tsx`, `src/cli.ts`, `README.md`, all `tests/**` |
| Unchecked     | none |
| Unplanned     | All 6 findings from the prior review (`f369351`) are resolved by `89114ca`: DRY grouping helpers extracted to `status-grouping.ts` (imported by `list-command.ts` + `status-columns-view.tsx`, one definition each — fixed); `EMPTY_FILTERS` module-level default stabilizes the `useEffect` deps (fixed); `toProgressStatusFilter` extracted to `progress-status-filter.ts` (imported by both commands, one definition — fixed); export now pages columns to terminal width via `computeVisibleColumnCount` + hidden-columns notice (fixed); `StatusColumnsView` body reduced to 16 lines via `useStatusColumnsLayout` + small presentational components (fixed); `useFetchedTaskGroups` catches fetch rejection and renders `FetchErrorMessage` (fixed). `pnpm test` 51/51 pass, `tsc --noEmit` clean, `biome check` clean (incl. `useHookAtTopLevel` — the new custom hook runs before the error early-return), `pnpm build` succeeds |
