---
name: translate
description: >
  Builds the canonical-source-to-target-native translation pipeline under src/contexts/translate/
  — target-aware content transforms, the plugin content translator, and the build strategies
  behind `aidd translate` and `aidd sync`. Use when adding a target-aware transform, changing
  `PluginContentTranslator`, adding a build strategy, or wiring a new tool into the build
  registry. Do NOT use for a tool's own profile, capability classes, or build contract — use
  `tools`. Do NOT use for where content is fetched from — use `distribution`. Do NOT use for
  manifest/install orchestration — use `framework`.
---

# Translate

`translate` is the core: it turns the canonical, Claude-format framework source into
target-native content for every tool at once. It reaches two places and no others: `tools`, its
one outbound context edge, and `kernel`. Everything it reaches in `tools` is that context's
declared public surface (`contracts.ts`, `registry.ts`, `build-contract.ts`, and the handful of
capability and port modules listed as public), never an internal file. The whole graph is in
`.claude/rules/00-architecture/0-contexts.md`.

## What goes in

| Concept | Location |
|---|---|
| A transform whose behavior differs by target tool | `domain/formats/` |
| The plugin-files-to-installed-files translator | `domain/content-translator.ts` (`PluginContentTranslator`) |
| The canonical framework-doc shape | `domain/canon.ts` |
| The canonical single-plugin shape | `domain/plugin-distribution.ts` |
| Build targets and modes | `domain/build-target.ts` |
| The `aidd translate` use-case | `application/translate-source.ts` (`FrameworkBuildUseCase`) |
| A build orchestrator (one per mode, never per tool) | `application/strategies/` |
| Schema validation for marketplace/plugin manifests | `infrastructure/schema-validator.ts` |

A transform used by exactly one tool profile does not belong here — it lives in that profile's
own directory. A transform shared by ≥2 profiles but identical regardless of target lives in
`contexts/tools/domain/formats/` instead. What belongs in `translate/domain/formats/` is a
transform that is *aware* of which target it is producing for.

## How

- `PluginContentTranslator` takes one plugin's canonical files and one tool's `AiTool<C>`, and
  calls the tool's own `rewriteContent` — it does not reimplement a
  tool's rewrite logic, it invokes what `tools` declared. That function is one-way and has no
  inverse; the `tools` skill's `references/content-rewrite.md` says why, and names the trap an
  identity rewrite sets.
- `FrameworkBuildUseCase` (`aidd translate`) reads a `ToolBuildContract` per target and mode from
  `tools`, and dispatches to `MarketplaceBuildStrategy` or `FlatBuildStrategy` — both implement
  `BuildOutputStrategy` and iterate the six artifact kinds generically, with zero per-tool or
  per-kind branching. Adding a build target means the target tool declares a contract in `tools`;
  it never means adding a case here. See the `tools` skill's `references/build-contract.md`.
- `runtime/wiring/translate.ts` derives the `"<target>:<mode>"` build registry by iterating every
  registered tool and reading its contract — there is no hand-maintained per-tool row.
- Follow the use-case and orchestration rules in `.claude/rules/00-architecture/` for the
  application layer's shape, and the shared-module rule there before promoting a helper used by
  only one strategy into `shared-plugin-helpers.ts`.

## Public surface

Nothing outside `contexts/translate/` may import a module this context has not declared public —
`tests/architecture/context-boundary.arch.test.ts` holds the list (`PUBLIC_MODULES.translate`).
`framework` is the only context that imports from here (`framework → translate`); a module used
by `framework` must be on that list.

## How it's tested

- `tests/contexts/translate/` mirrors `src/contexts/translate/` — formats, content-translator,
  canon, and the two build strategies each have unit or integration coverage.
- `tests/golden/framework-build-golden.e2e.test.ts` snapshots a full build across every target —
  see `test` skill's golden/machine-independence rules before touching a snapshot.
- A new target-aware transform gets a unit test over a representative input carrying the marker it
  is meant to rewrite. A transform that is the identity for the fixture it was given is
  indistinguishable from one that never ran.
