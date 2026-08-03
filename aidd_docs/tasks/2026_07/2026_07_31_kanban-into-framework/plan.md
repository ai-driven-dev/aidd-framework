---
objective: "Ship the kanban tool inside the AIDD CLI as `aidd kanban`: code moved and green in CI, exercised on real projects, its product direction decided and written down, documented for users, then released."
status: in-progress
---

# Plan: kanban into the framework

## Overview

| Field      | Value                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **Goal**   | `aidd kanban` shipped to AIDD CLI users, with its product direction decided on evidence rather than on a README |
| **Source** | [`brainstorm.md`](./brainstorm.md) and the conversation that produced it                                    |

## Phases

| #   | Phase                                     | State       |
| --- | ------------------------------------------- | ------------ |
| 1   | Move the code and mount it on `aidd`        | done         |
| 2   | Make the pipeline green                     | done         |
| 3   | Exercise it on real projects                | done         |
| 4   | Decide what the kanban becomes              | next         |
| 5   | Write the product brief                     | pending      |
| 6   | Document it for users                       | blocked      |
| 7   | Open the pull request                       | blocked      |
| 8   | Release                                     | blocked      |

Phases 6 to 8 are deliberately held. The command is registered but hidden from `aidd --help`, so it ships to nobody while the work continues on `feat/kanban-into-framework`. Nothing is documented, proposed or released until phases 4 and 5 settle what the kanban is for.

### Phase 1 — Move the code and mount it on `aidd` (done)

`framework/kanban/` holds the source, the tests, Francois's three task folders and a README crediting him. `cli/src/application/commands/kanban.ts` mounts `list` then the interactive view on a `kanban` subcommand. Output goes through `CLIOutput`, failures through `ErrorHandler`, and the docs directory name is injected from `DOCS_DIR` instead of a literal. `--json` prints `TaskGroup[]` verbatim.

Verified: kanban 68/68, cli 2155/2155, biome clean on both, build 416.2 KB against a 500 KB budget, and `aidd kanban list <path>` resolves as a subcommand rather than being read as a path.

### Phase 2 — Make the pipeline green (done)

The move broke CI: `cli/tsconfig.json` type-checks `../kanban/src/**/*`, but no job installed kanban, so `tsc` failed with `TS2307: Cannot find module 'gray-matter'`. Three fixes, all in `.github/workflows/`:

- `cli-ci.yml` and `ci.yml` install kanban before every job that runs a TypeScript-aware tool over the CLI's program: typecheck, test, build, knip, and the publish build.
- `cli-ci.yml` path filters now include `kanban/**`, so a change touching only kanban still triggers the workflow.
- A `kanban-checks` job runs kanban's own typecheck, lint and test suite, which nothing ran before.

Verified by replaying the CI sequence locally from a clean `kanban/` install.

A fourth fix came from the pre-push hook rather than from CI. `knip` reported `cli-table3`, `gray-matter`, `ink` and `react` as unused dependencies: it analyses `cli/src` and their only consumers live in `../kanban/src`, outside its scope. Widening knip's `project` to reach the sibling folder makes it worse — declaring `project` at all breaks dependency detection for all nine dependencies, not just the four. So `knip.json` lists the four under `ignoreDependencies` instead.

This silences a real check for exactly those four: if kanban ever stops using one, nothing will say so. The CI knip job is `continue-on-error: true`, so only the local pre-push hook enforces it, and it now passes.

Two more surfaced only once the change landed on `next`, because the `Validate` workflow runs the framework-local lefthook jobs that the PR checks do not. The `json-validity` job parses every JSON file as strict JSON, so the explanatory `//` comments added to `cli/tsconfig.json` broke it — TypeScript accepts JSONC, this repository does not. And the `cli-typecheck` job type-checks the CLI, which now spans `kanban/src`, without ever installing that folder. Its glob is now `{cli,kanban}/**` and it installs kanban when `kanban/node_modules` is missing.

The lesson for anything else that reaches across the two folders: green PR checks are not the whole pipeline. Replay `npx lefthook run pre-commit --all-files` from a tree where `kanban/node_modules` does not exist.

### Phase 3 — Exercise it on real projects (done)

Run against `framework` (67 documents), `cli` (164), `kairos-app` (259) and `breathflow` (10), table view and interactive view, the latter under a real pty at 190x45. Full write-up in [`findings.md`](./findings.md).

It surfaced a defect that all 68 kanban tests and all 2155 CLI tests missed: every filter was dead through `aidd kanban`, because both views declared the same option names and the interactive one was mounted directly on the `kanban` command, so commander bound the options to the parent. Fixed by giving the interactive view its own `isDefault` subcommand. Kanban's own tests mount on a bare root, where no parent exists to shadow anything, so nothing covers the wiring as it is actually mounted.

### Phase 4 — Decide what the kanban becomes (next)

A product brainstorm, fed by [`findings.md`](./findings.md). What the real runs put on the table:

- Vertical scrolling was an explicit non-goal; at 164 documents the board overflows a 45-row terminal and the selection moves off-screen. It is now the first question.
- Literal status as the column key yields `findings-1-2-done` on `cli` and `read-only — diagnose only, no fixes` on `kairos-app`. Sound on a clean backlog, meaningless on three real ones.
- The name fallback rescues parents only, so one cell shows `- plan: unknown` six times.
- `--type plan` returns nothing against this framework's own documents: the plan template never emits a `type` field.
- A project with ten documents and no frontmatter prints "No task documents found.", and nothing hints that `--all` exists.

And the questions that predate the runs:

- The later UI app is unspecified: served by the CLI in a browser, or desktop. `--json` defers the question without answering it.
- `aidd` already has an interactive surface. `runMenuLoop()` chains `@inquirer/prompts` line by line while Ink takes the whole screen; the two coexist but do not compose. Whether the menu eventually migrates to Ink is undecided, and it is a bigger question than kanban.
- A parent's status never aggregates from its sub-documents. Francois deferred this deliberately. Real backlogs will say whether it holds.
- The `--json` contract emits `filePath` exactly as given on the command line, relative to the CLI's working directory. A consumer cannot resolve it without knowing that directory. Decide before a UI depends on it.

### Phase 5 — Write the product brief (pending)

Turn phase 4's decisions into a product brief. Distinct from [`brainstorm.md`](./brainstorm.md), which frames the move and says nothing about what the kanban is for.

### Phase 6 — Document it for users (blocked)

`aidd kanban` currently appears in no user-facing document: not the root `README.md`, not `docs/`, not `cli/README.md`. Only `kanban/README.md` describes it, and nobody reads that folder. Nothing is discoverable until this is done.

### Phase 7 — Open the pull request (blocked)

Commit on `feat/kanban-into-framework` and open against `next`, per the branch table in `aidd_docs/memory/vcs.md`. Only `hotfix/*` targets `main`.

### Phase 8 — Release (blocked)

`ci.yml` publishes `@ai-driven-dev/cli` to npm once release-please cuts the version. This is the one step in the chain that does not replay: an npm version cannot be cleanly unpublished, and every `aidd` user picks up ink and react in their install. Everything above should be settled before this runs.

## Decisions

| Decision                                                                                                              | Why                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run the product conversation on the moved, running tool rather than before the move                                     | The renderer boundary already holds, so almost every direction stays reachable from the moved code; discussing direction on something that runs beats discussing it on a README                 |
| `framework/kanban/` keeps its own `package.json` and lockfile, against the brainstorm's "no lockfile" line               | `tsc --traceResolution` shows the `paths` substitution attempted and rejected: under `moduleResolution: NodeNext` in ESM mode, a substitution onto a package directory does not resolve. The intent behind the line still holds — no version, no bin, never published |
| Kanban's tests stay under their own vitest config and their own CI job, outside cli's unit/integration/e2e projects      | Cli's projects select by filename suffix; adopting them means renaming eleven files and classifying someone else's tests, which blurs the behavior parity used as the move's acceptance signal |
| The `--json` output is emitted verbatim from the use case, reshaping deferred to the product conversation                | It is the contract a future UI consumes; reshaping it before knowing the consumer would be guessing                                                                                             |
| The command is registered but hidden from `aidd --help`, rather than left unwired                                       | It must reach no user before its direction is settled, while staying runnable for the people working on it. Unwiring it entirely would make that work harder for no extra safety                |
| The work stays on `feat/kanban-into-framework` and nothing is proposed to `next` yet                                     | The packaging choice — kanban inside the `aidd` binary rather than beside it — is cheap to revisit on a branch and expensive once published                                                     |
