---
objective: Collapse 5 copies of resolveBaseDir and 2 copies of qualifiesForOpencodeMcpMerge into shared functions in plugin-helpers.ts without changing behavior.
status: implemented
---

# US-E7-02: shared plugin base-dir helper

## Background

The ticket claimed 2 copies of `resolveBaseDir`. Reading the code found 5. All 5 were read
in full and compared line by line before any extraction happened.

## What the 5 copies actually were

| # | File | Signature | Guard style | Homedir source | Pre-guard on installScope |
|---|------|-----------|-------------|-----------------|----------------------------|
| 1 | plugin-remove-use-case.ts:105 | `(toolId, projectRoot)` | `isAiTool` + `"plugins" in caps` | `homedir()` from node:os, called eagerly | yes: `if (installScope !== "user") return projectRoot` |
| 2 | plugin-update-use-case.ts:168 | `(toolId, projectRoot)` | `isAiTool` + `"plugins" in caps` | `homedir()` from node:os, called eagerly | yes, same as #1 |
| 3 | mode-b-flat-materialization-translator.ts:192 | `(plugins, projectRoot)` — takes the resolved `PluginsCapability` directly | none (capability already resolved by caller) | injected `this.homedir: () => string` | no — calls `resolvePluginsBaseDir` directly |
| 4 | built-tree-materialization-translator.ts:127 | `(toolId, projectRoot)` | `isAiTool` only; casts `capabilities as { plugins: PluginsCapability }` with no presence check | injected `this.homedir: () => string` | no |
| 5 | detect-plugin-drift-use-case.ts:53 | `(toolId, projectRoot)` | `tool === undefined \|\| !isAiTool(tool)`, then `plugins === undefined` | `homedir()` from node:os, called eagerly | no |

`qualifiesForOpencodeMcpMerge` (plugin-remove-use-case.ts:76 and
mode-b-flat-materialization-translator.ts:133) were verbatim identical: same body, same
`Record<string, unknown>` parameter type, same reliance on `McpCapability` instanceof check
and `plugins.mode === "flat"`.

## Behavioral analysis

- `PluginsCapability.resolvePluginsBaseDir(projectRoot, homedir)` (domain/capabilities/plugins-capability.ts:163)
  already returns `projectRoot` unless `installScope === "user"` and a `userPluginsDir`
  resolver was configured. So the `if (installScope !== "user") return projectRoot`
  pre-guard present in copies #1 and #2 is redundant, not a behavioral difference — dropping
  it changes nothing observable.
- Copy #4 skipped the `"plugins" in caps` presence check and cast straight to
  `{ plugins: PluginsCapability }`. This looked unsafe in isolation, but
  `BuiltTreeMaterializationTranslator` is only ever constructed via `resolveTranslator()`
  (plugin-translator-factory.ts), which itself is only called with a `PluginsCapability`
  already resolved from that same toolId's config. The "plugins missing" branch in the
  unified helper is dead code for this caller, not a change in reachable behavior.
- Copy #5's `tool === undefined` check was dead code: `getToolConfig(toolId)` throws
  `UnregisteredToolError` and never returns `undefined`. Dropped with no effect.
- The homedir difference is real but not behaviorally significant to unify: 3 copies
  call `homedir()` from `node:os` directly, 2 copies receive an injected
  `() => string`. The shared helper takes `homedir: () => string` as a parameter so each
  caller keeps passing what it already passed (either `nodeHomedir` from node:os, or its
  own injected `this.homedir`). One call-count nuance: copies #1/#2 previously invoked
  `nodeHomedir()` eagerly before the `installScope` guard could short-circuit; the shared
  helper only invokes it once inside `resolvePluginBaseDirForCapability`, and only when a
  `plugins` capability exists. `homedir()` is a pure synchronous read, so this is inert.

No copy was found to differ in a way that changes real behavior. All 5 were unified.

## What was extracted

Added to `src/application/use-cases/plugin/plugin-helpers.ts` (existing home for shared
plugin helpers, plain exported functions, no classes):

- `resolvePluginBaseDirForCapability(plugins: PluginsCapability, projectRoot: string, homedir: () => string): string`
  — the primitive. One-line wrapper around `plugins.resolvePluginsBaseDir(projectRoot, homedir())`.
  Used directly by `ModeBFlatMaterializationTranslator` (copy #3), which already has a
  resolved `PluginsCapability` in hand.
- `resolvePluginBaseDir(toolId: AiToolId, projectRoot: string, homedir: () => string): string`
  — looks up the tool config, checks `isAiTool` and `"plugins" in caps`, then delegates to
  `resolvePluginBaseDirForCapability`. Used by the other 4 callers (plugin-remove,
  plugin-update, built-tree translator, detect-plugin-drift), each passing whatever
  homedir source it already had (`nodeHomedir` from node:os, or its own injected
  `this.homedir`).
- `qualifiesForOpencodeMcpMerge(caps: Record<string, unknown>): boolean` — moved verbatim
  from the two identical copies.

All 5 private `resolveBaseDir` methods and both private `qualifiesForOpencodeMcpMerge`
methods were deleted from their original classes.

## Import direction

`plugin-helpers.ts` lives in `use-cases/plugin/`. It only imports from `domain/` (capabilities,
ports, tools/registry) — no imports from `use-cases/shared/` or elsewhere in
`use-cases/plugin/`, so it stays a leaf module. `detect-plugin-drift-use-case.ts` (in
`use-cases/shared/`) importing from `../plugin/plugin-helpers.js` does not create a cycle:
`use-cases/shared/apply-plugin-files-use-case.ts` already imports from
`use-cases/plugin/translator/*`, so a shared→plugin import direction was already established
in this codebase.

## Decisions

| Decision | Why |
|---|---|
| Two functions, not one | Copy #3 already holds a resolved `PluginsCapability` and has no toolId-based lookup to do; forcing it through a toolId-based function would mean re-deriving the toolId → capability mapping it already did, or inventing a fake toolId. The other 4 callers only have a toolId. Splitting the primitive from the toolId-resolving wrapper matches both call shapes without extra layers. |
| `homedir` as a function parameter, not a fixed import | 2 of 5 callers inject their own `homedir: () => string` from `BuiltMaterializationDeps` / `TranslatorDeps` (used for testing and for controlled resolution). Forcing everyone onto `node:os`'s `homedir` would silently drop that injection seam for those two callers. |
| Dropped the `installScope !== "user"` pre-guard | Confirmed redundant by reading `PluginsCapability.resolvePluginsBaseDir` (plugins-capability.ts:163-168), which already returns `projectRoot` for anything other than `installScope === "user"` with a configured `userPluginsDir` resolver. The pre-guard can never diverge from what the delegate already computes, so dropping it changes nothing observable. This was established by reading the source, not by mutation testing. |
| Added the `"plugins" in caps` presence check to copy #4's call path | Copy #4 (built-tree translator) cast straight through without checking. The unified helper's check is a strict superset — it can only ever return early with `projectRoot` in a case that never occurs for this caller (verified: `BuiltTreeMaterializationTranslator` is only constructed with a toolId whose capabilities already contain `plugins`, via `resolveTranslator`). No coverage regression risk since the branch was already unreachable for this caller. |
| Dropped copy #5's `tool === undefined` check | `getToolConfig` never returns `undefined` (it throws `UnregisteredToolError` on a missing tool); the check was dead code. |
| Narrowed `resolvePluginBaseDir`'s `toolId` param to `AiToolId`, not the broader `ToolId` | All 5 real call sites pass an `AiToolId` (detect-plugin-drift-use-case.ts already casts `id as AiToolId` before calling); keeping the same contract width as the original private methods rather than widening it. |

## Verification

1. `npx tsc --noEmit` — no errors, before and after all edits.
2. `pnpm test` — 194 test files / 2105 tests passing, both before this change (verified by
   stashing the diff and running against a clean `origin/next` checkout) and after. The
   ticket stated a baseline of 2107; the actual baseline measured on this machine, against
   the unmodified branch, is 2105. No test file's assertions were changed; the count did not
   drop.
3. Biome: `npx biome check --write <file>` never completed on this machine — it failed
   with "Linter process terminated abnormally (possibly out of memory)" on every retry,
   including a bare `npx biome --version`, so the failure was at the `npx` invocation
   layer, not in biome's linting itself. Switched to calling the binary directly:
   `./node_modules/.bin/biome check --write <file>`, one file per invocation, for all 6
   changed files. Biome auto-fixed `import { McpCapability }` to
   `import type { McpCapability }` in `plugin-remove-use-case.ts` and
   `mode-b-flat-materialization-translator.ts`, since the `instanceof McpCapability` check
   that needed the value import moved into `plugin-helpers.ts`'s
   `qualifiesForOpencodeMcpMerge`, leaving only a type-position use behind. A second pass on
   all 6 files reports "No fixes applied" for every file.
4. Mutation test: `resolvePluginBaseDirForCapability` was temporarily changed to always
   return `join(projectRoot, "__mutated__")` — a sentinel that changes the resolved path
   for every caller regardless of install scope (an earlier attempt to mutate by forcing
   `return projectRoot` was rejected because that is what most callers already compute for
   project-scope tools, so it wouldn't have proven anything). Re-running `pnpm test` under
   this mutation produced 10 failing test files spanning at least 4 of the 5 unified call
   sites:
   - `tests/application/use-cases/plugin/plugin-remove-use-case.unit.test.ts` (copy #1)
   - `tests/application/use-cases/plugin/translator/mode-b-flat-materialization-adapter.unit.test.ts` (copy #3)
   - `tests/application/use-cases/plugin/translator/install-plugin-cursor-mode-b.integration.test.ts`,
     `install-plugin-opencode-mode-b.integration.test.ts`,
     `install-plugin-cursor-hooks-mcp.integration.test.ts`,
     `remove-plugin-cursor-hooks-mcp.integration.test.ts` (copy #3 and #1, materialization paths)
   - `tests/application/use-cases/plugin/translator/built-tree-cursor-materialization.integration.test.ts` (copy #4)
   - `tests/application/use-cases/doctor-plugin.unit.test.ts`,
     `tests/application/use-cases/status-plugin-user-scope.unit.test.ts` (copy #5, via `DetectPluginDriftUseCase`)
   - `tests/e2e/plugin-create.e2e.test.ts` (full round trip, install path)

   14 individual test cases failed across those 10 files. The helper was restored and the
   full suite was re-run to confirm a return to 194/194 files, 2105/2105 tests passing.

   Notably, `plugin-update-use-case.unit.test.ts` (copy #2's caller) did **not** fail under
   the mutation. Its two test cases either skip the file-rewrite path entirely (same-version
   case) or only assert on the manifest's recorded version, never on the written file's
   path — so the `resolveBaseDir` branch in `PluginUpdateUseCase` is exercised but its output
   is not checked. This matches the ticket's own note that `plugin-update-use-case.ts` sits
   at 77% branch coverage with known gaps; it is a pre-existing coverage gap surfaced by this
   exercise, not a defect introduced by the extraction.

## Behavioral differences found

None that blocked unification. The only divergences among the 5 copies (redundant
pre-guard, missing presence check, dead undefined check, eager vs. lazy homedir call) were
confirmed non-observable, as detailed in the Decisions table above. All 5 copies were
merged into `resolvePluginBaseDir` / `resolvePluginBaseDirForCapability`.
