---
name: kanban-into-framework
description: Bring the cli-kanban tool into framework/kanban and expose it as aidd kanban
type: brainstorm
status: pending
---

# Kanban into the framework, behind `aidd kanban`

`ai-driven-dev/cli-kanban` is a working, single-author CLI that reads any project's `aidd_docs/` frontmatter and shows the task documents as status columns, either as a full-screen Ink view or as a piped table. Francois Duval built it in three iterations over two days, with a spec, a plan and a review for each, and 51 passing tests. It lives outside the framework today, and nothing links it to the `aidd` binary its own plans repeatedly cite as the stack reference.

The move brings that code into `framework/kanban/` as a folder of source, not a second npm package. `framework/cli` gains a `kanban` command group that imports it directly; tsup follows the relative source and bundles it, so there is no workspace to set up, no publish ordering, and no second release-please entry. Users get `aidd kanban` for the interactive view and `aidd kanban list` for the export, with the existing `--type`, `--status`, `--progress` and `--all` filters unchanged. A UI app is expected later; it is not part of this move, but the move must not close the door on it.

## What Is Clear

- Francois has agreed to the move. His repository is private and carries no LICENSE file, and the destination is public MIT, so the move should carry an explicit attribution to him as the source author.
- The destination is `framework/kanban/`, holding `src/`, `tests/` and the three task folders that record why the tool is shaped the way it is. Kanban stops having its own version, bin and lockfile.
- The contact point is a single file under `cli/src/application/commands/`, registered alongside the thirteen existing command groups in `cli/src/cli.ts`.
- The 500KB bundle budget is not a constraint. `cli/tsup.config.ts` sets `skipNodeModulesBundle: true`, and `dist/cli.js` opens with `import{Command}from"commander"` — dependencies stay external, so the 410KB measures aidd's own source. Kanban's source adds roughly 25KB against 90KB of headroom.
- `ink`, `react`, `gray-matter` and `cli-table3` become runtime dependencies of `@ai-driven-dev/cli`, so every `aidd` install pulls them. Loading kanban through a dynamic import inside the command action keeps that cost off every other command's startup.
- Three changes are load-bearing, not stylistic: commander moves from 12 to 15 because one binary carries one version; `cli/tsconfig.json` gains `jsx: "react-jsx"`, without which the `.tsx` files do not compile; and cli's test includes gain `.tsx`. On the first two, cli adapts to kanban as much as the reverse.
- Three changes are justified because a user sees them: kanban writes through `CLIOutput` so `--verbose` works on `aidd kanban` like everywhere else, routes failures through cli's error handler so its errors look like the other thirteen commands', and uses the existing `DOCS_DIR` constant instead of its own `"aidd_docs"` literal.
- Biome needs no alignment work. The two configs are effectively the same file — same `recommended: true`, same space/2/100 formatter, same double quotes, same `trailingCommas: es5`, same `organizeImports`, same `package.json` override. The only meaningful difference is the schema version, and kanban is ahead at 2.5.4 against cli's 2.4.7. The framework keeps one file, and it is kanban's.
- Behavior parity with today's output is the acceptance signal.
- One capability is added: `--json`, emitting the `TaskGroup[]` that `ListTaskDocumentsUseCase.execute()` already returns. That is the contract a future UI consumes.
- The renderer boundary already holds and must keep holding. `ink` and `react` appear in exactly three files, all under `presentation/`; `domain`, `application` and `infrastructure` are rendering-agnostic. No Ink or React type may move upward.
- The decisions worth carrying forward, because they were argued once and should not be re-litigated: `gray-matter` for tolerant frontmatter parsing; unknown-bucket normalization as a domain rule rather than a parser concern; columns keyed by the parent document's literal status, with `--progress` surviving as an orthogonal filter; a sub-document's status never moving its parent's column, deliberately; column order following `pending → in-progress → implemented → reviewed → blocked` then first-seen; and `plan.md`/`master-plan.md`/`spec.md` falling back to their folder name because those templates define no `name` field at all.
- Ink was built, deleted on `feature/list-progress-columns`, then reinstated. The reinstatement reason on record is that the code already existed and was tested, and hand-rolling stdin handling is riskier for no capability the iteration needed. Dropping Ink again needs a stronger argument than the one that already failed twice.
- Spelling settles on `kanban`. The upstream package name, README title and bin all say `cli-kaban`.

## Deliberately Out Of Scope

- Folding kanban's tests into cli's vitest projects. `cli/vitest.workspace.ts` selects projects by filename suffix — `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts` — and none of kanban's eleven test files follow it. Aligning means renaming all of them and classifying someone else's tests as unit, integration or e2e, which is a judgment call that blurs the very parity used as the acceptance signal. It also subjects them to cli's coverage thresholds (85/80/90/85), which they were never written against. The target config is itself stale: `defineWorkspace` is deprecated in the installed vitest 3.2.6 — `@deprecated use the projects field in the root config instead`, `node_modules/vitest/dist/config.d.ts:95`. Kanban keeps its own vitest config through the move; the renaming happens later, alongside cli's own migration to `test.projects`.
- Three defects Francois logged himself: a non-string frontmatter value such as `type: 2026` escapes the unknown bucket because `matter().data` is asserted to `string`; the hidden-columns notice and the fetch-error branch have no test; `buildStatusColumnTable` runs 35 lines against a 30-line rule. All become follow-up tickets.
- The UI app itself. `--json` is the door left open, nothing more.

## Still Open

- `aidd` already has an interactive surface: `runMenuLoop()` in `cli/src/application/commands/menu.ts` draws a banner, chains `@inquirer/prompts` and spawns subcommands line by line. Ink takes the whole screen and owns its own input. The two coexist but do not compose — an Ink view cannot mount inside the inquirer menu. Assumed acceptable, with the menu's eventual migration to Ink carried as known debt rather than silently ignored.
- The later UI app is unspecified: browser served by the CLI, or desktop. `--json` defers the question without answering it.
- Where kanban's three task folders land inside `framework/kanban/aidd_docs/tasks/` — carried verbatim, or restated. Assumed carried verbatim, since they are the decision record.

## Source Material

| What | Where |
| ---- | ----- |
| Upstream repository | `github.com/ai-driven-dev/cli-kanban` (private), 27 commits, all by Francois Duval, last 2026-07-20 |
| First iteration | `aidd_docs/tasks/2026_07/2026_07_19_aidd-docs-kanban-viewer/` — spec, plan, 5 phases, review (changes-requested) |
| Second iteration | `aidd_docs/tasks/2026_07/2026_07_19_list-status-columns/` — spec, plan, 5 phases, review (approve) |
| Third iteration | `aidd_docs/tasks/2026_07/2026_07_20_status-column-refinements/` — plan, 2 phases |

## Next Move

Do the move, then run `aidd kanban` against the `aidd_docs` of `framework`, of `cli`, and of a real project, and let what shows up there feed the conversation about what the kanban becomes.
