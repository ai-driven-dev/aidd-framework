---
name: framework
description: >
  Owns the installation record and everything done to a project, under
  src/contexts/framework/ — the manifest aggregate, and the setup/install/restore/uninstall/doctor
  orchestration built on top of it. This is the only context allowed to reach `translate`,
  `tools`, and `distribution`. Use when adding a use-case that touches the manifest, a
  setup/doctor/sync/uninstall flow, a new top-level CLI orchestration, or a launcher that runs an
  external binary (kanban-shaped). Do NOT use for a tool's own profile or capability classes —
  use `tools`. Do NOT use for the translation pipeline — use `translate`. Do NOT use for where
  content is fetched from — use `distribution`.
---

# Framework

`framework` is what is posed on a project and the record of it: the manifest that tracks every
installed file, and every flow that reads or changes that record — setup, doctor, sync (restore),
uninstall, plugin install/update/remove, and the global chain orchestrators. It is the one
context the dependency chain lets reach every other context (`framework → translate → tools →
kernel`, plus `framework → distribution`), because assembling what goes on disk is exactly the
job that needs all three.

## What goes in

| Concept | Location |
|---|---|
| The manifest aggregate and its members | `domain/manifest.ts`, `domain/manifest/` (tool-entry, tracked-files, merge-files, mcp-exclusions) |
| A plugin's declared state | `domain/plugins/` (installed-plugin, source-resolver, requested-version-policy) |
| The diagnosis shape | `domain/doctor.ts` |
| Setup orchestration state | `domain/setup-flow.ts` |
| A port only `framework` needs | `domain/ports/` (manifest-repository, plugin-distribution-reader) |
| A top-level flow's orchestrator | `application/` root, or a feature subdirectory (`doctor/`, `restore/`, `setup/`, `uninstall/`, `plugin/`, `global/`, `install/`, `flows/`) |
| Logic needed by ≥2 top-level use-cases | `application/shared/` — never called from a command |
| The manifest-repository and plugin-distribution-reader adapters | `infrastructure/` |

## How

- A use-case class ends in `UseCase`, has a single `async execute(options): Promise<Result>`,
  never catches its own errors except the three carve-outs (global aggregate-error loops,
  cache/network fallback, typed-throw translation) — see the use-case and orchestration rules in
  `.claude/rules/00-architecture/`.
- A use case that installs framework files saves the manifest and updates `.gitignore`
  through `PostInstallPipelineUseCase`. A use case that only changes the manifest (plugin
  add/remove, marketplace sync, restore) saves it directly. See `references/post-install-pipeline.md`.
- Before writing any framework file: check `fs.fileExists(path) && !manifest.isFileTracked(path)`.
  If both are true, skip the write, warn, and never add it to the manifest — never overwrite a
  user-owned file. See `references/manifest.md`.
- A global chain orchestrator (`*-all-use-case.ts`) iterates every scope and must finish even if
  one fails: wrap one iteration in `try/catch`, push a typed entry to an `errors[]` array, and
  return it in the result — never let one tool's failure abort the whole run.
- A capability-guard sub-use-case (`install-agents-use-case.ts` and its siblings) checks
  `"name" in caps` before dispatching to a narrowed sub-use-case in `install/` — see
  `references/post-install-pipeline.md`, section "Capability sub-use-cases". These five files reach directly into `tools`'
  capability classes rather than through a declared public module; that reach is a tracked,
  shrinking exception in `context-boundary.arch.test.ts`, not a pattern to add to.
- **A launcher spawns its target, never imports it.** The decision and its cost are in
  `aidd_docs/memory/architecture.md`.

## Public surface

Nothing outside `contexts/framework/` may import a module this context has not declared public.
`framework` is also the context most other contexts should never see: nothing in `tools`,
`translate`, or `distribution` may import from `framework` at all — the arrow only runs the other
way. Check `tests/architecture/context-graph.arch.test.ts` before adding an edge; check
`context-boundary.arch.test.ts`'s `PUBLIC_MODULES` before assuming a module framework itself
exposes is reachable from `presentation` or `runtime`.

## How it's tested

- `tests/contexts/framework/` mirrors `src/contexts/framework/` — domain models are unit-tier,
  use-cases against in-memory ports (`tests/helpers/ports/`) are unit or integration depending on
  whether they touch a real temp filesystem.
- `tests/e2e/` exercises full CLI invocations through `runCli()`; `tests/golden/` snapshots a
  built framework tree end to end — see the `test` skill for tier and golden-snapshot rules.
- A manifest version-guard change needs a fixture manifest at the boundary version, asserting the
  exact refusal message names the fix.
