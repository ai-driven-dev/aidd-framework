---
objective: Collapse the duplicated resolve-translator and built-tree-materialize steps across plugin add, update, and restore into two shared functions, without changing observable behavior.
status: implemented
---

# US-E7-03: translator pipeline consolidation

## The three sites

1. `plugin-add-use-case.ts` — `PluginAddUseCase.addPluginForTool` (fresh install; registers
   via `manifest.addPlugin`, thrown by the manifest if a duplicate exists).
2. `plugin-update-use-case.ts` — `PluginUpdateUseCase.replacePluginFiles` (deletes the
   plugin's previously recorded files first, then re-materializes; registers via
   `manifest.updatePlugin` on the fallback path, or via the built-tree translator's own
   `manifest.addPlugin` after an explicit `manifest.removePlugin` on the built-tree path).
3. `apply-plugin-files-use-case.ts` — `ApplyPluginFilesUseCase.execute` (used only by
   `RestoreAllPluginsUseCase`; no delete-first step, does an idempotent hash-check per file
   so restore doesn't touch files already at the correct content).

All three read the same `PluginsCapability` on the tool config and call
`resolveTranslator()` (`plugin/translator/plugin-translator-factory.ts`) to get one of
`BuiltTreeMaterializationTranslator` (mode `flat`), `ModeAMarketplaceTranslator` (mode
`marketplace`), or `null` (no translator applies). That interface, its three
implementations, and the factory function itself were out of scope for this story and were
not touched.

## How they actually differed

Reading all three end to end (not just the ticket's one-line description) found two
distinct behaviors bundled under "resolve translator → materialize → register", not one:

- **Resolving the translator**: sites 2 and 3 each had a private `builtTreeTranslator`
  method with the identical body — guard on `isAiTool`, guard on `"plugins" in caps`
  (site 2 used `caps.plugins === undefined` instead of `in`, same effect), call
  `resolveTranslator`, then narrow the result with `instanceof
  BuiltTreeMaterializationTranslator`. Site 1's `resolveAdapter` did the same guard-and-call
  but returned the raw `PluginTranslator | null` without narrowing, since it also needs to
  dispatch on `mode === "marketplace"`.
- **Materializing via the built tree**: sites 2 and 3, once they had a
  `BuiltTreeMaterializationTranslator` and knew `plugin.marketplace !== undefined`, both did
  the exact same two-step dance: `manifest.removePlugin(toolId, plugin.name)` followed by
  `translator.addPlugin(dist, toolId, plugin.source, projectRoot, manifest,
  plugin.marketplace, docsDir)`. This dance exists because `addPlugin` on every translator
  implementation calls `manifest.addPlugin` internally (never `updatePlugin`), and
  `manifest.addPlugin` throws `DuplicatePluginError` if the name is already registered — so
  the caller must clear the old entry first. Site 1 never needs this: on a fresh add there
  is no old entry, so it calls the translator's `addPlugin` directly, and additionally has to
  thread through `previousMcpEntries` (for OpenCode MCP re-merge on `--replace`) and the
  `{ skipped }` return value that sites 2/3 don't use.
- **The non-built-tree fallback** (when the translator is null, or the built-tree translator
  applies but `plugin.marketplace` is undefined, or the resolved translator is
  `ModeAMarketplaceTranslator`) is genuinely different content-wise at all three sites:
  - Site 1 writes to `projectRoot` directly and calls `PluginContentTranslator
    .translateWithComponentPaths`, then `manifest.addPlugin`.
  - Site 2 writes to `resolvePluginBaseDir(toolId, projectRoot, homedir)` (which resolves to
    the tool's user-scope dir for cursor, not `projectRoot`) using the same
    `translateWithComponentPaths`, guarded by an `isLocalMarketplace` check that skips
    writing/records empty files for local-marketplace-sourced plugins, then
    `manifest.updatePlugin`.
  - Site 3 writes to `join(projectRoot, relativePath)`, using the plainer
    `PluginContentTranslator.translate` (no component paths, no skip list), with a
    per-file hash check (`isFileAtDesiredState`) so restore is idempotent, then
    `manifest.updatePlugin(plugin.withFiles(...))`.

  Three different write targets and three different write/idempotency policies. Unifying
  this would change what gets written where for at least one caller, which the ticket
  explicitly asks not to do if the difference is genuine. It is genuine — confirmed by
  reading, not assumed — so this piece was left alone in each of the three files.

## What was extracted

1. `resolvePluginTranslator(toolConfig, deps): PluginTranslator | null` — new file
   `src/application/use-cases/plugin/translator/resolve-plugin-translator.ts`. Replaces the
   duplicated guard in all three sites' translator-resolution code. Site 1's `resolveAdapter`
   and sites 2/3's `builtTreeTranslator` all call it now; sites 2/3 still narrow the result
   with their own local `instanceof BuiltTreeMaterializationTranslator` check.
2. `materializeViaBuiltTree(translator, dist, toolId, plugin, projectRoot, manifest,
   docsDir): Promise<void>` — added to `src/application/use-cases/plugin/plugin-helpers.ts`.
   Does the `removePlugin` + `translator.addPlugin` dance. Used by site 2's
   `replacePluginFiles` and site 3's `restoreViaBuiltTree`. Site 1 does not use it (see
   above: no old entry to remove, different return shape needed).

Site 1 (`plugin-add-use-case.ts`) keeps calling `adapter.addPlugin(...)` directly on its
flat-mode branch — that call was already a single line delegating everything to the
translator; there was nothing left to extract from it beyond the resolution step.

## Decisions

| Decision | Why |
|---|---|
| Put `resolvePluginTranslator` in a new file under `plugin/translator/`, not in `plugin-helpers.ts` | `plugin-helpers.ts` is imported (as values) by `built-tree-materialization-translator.ts` and `mode-b-flat-materialization-translator.ts` for `resolvePluginBaseDir`/`writePluginFiles`. Had `resolvePluginTranslator` lived in `plugin-helpers.ts`, importing `resolveTranslator` from the factory would have closed a cycle: `plugin-helpers.ts` → `plugin-translator-factory.ts` → `built-tree-materialization-translator.ts` → `plugin-helpers.ts`. Putting the new function in a leaf file downstream of the translator module keeps the dependency one-way. This is a deliberate deviation from the "shared plugin helpers live in plugin-helpers.ts" convention, made to avoid the cycle rather than out of preference. |
| Put `materializeViaBuiltTree` in `plugin-helpers.ts`, not the new translator file | It only needs `BuiltTreeMaterializationTranslator` as a parameter *type*, which TypeScript erases (`import type`), so there is no runtime value import back into the translator module and no cycle. It fits the existing "plain exported function" idiom already used by `resolvePluginBaseDir` and `writePluginFiles` in the same file. |
| Used the `"plugins" in caps` guard idiom inside `resolvePluginTranslator`, not `caps.plugins === undefined` | `resolvePluginBaseDir` (same file, same kind of guard, pre-existing) already uses `in`. Matching the house idiom rather than site 2's variant, since both are equivalent for a capability that, when present, is never `undefined`. |
| Left the `builtDeps === undefined` early return inside each of sites 2/3's own `builtTreeTranslator`, not inside the shared helper | Site 1 has no `builtDeps` concept at all — it always has `ensureBuilt`/`marketplaceRegistry` as required constructor params, not optional ones, and passes `nodeHomedir` directly. Pushing that guard into the shared helper would mean inventing an optional-deps parameter shape that only two of the three callers need. |
| Did not touch the non-built-tree fallback logic in any of the three files | Confirmed by reading (not assumed) that the three fallbacks write to three different targets with three different policies (`projectRoot` unconditionally; `baseDir` with an `isLocalMarketplace` skip; `projectRoot` with a per-file hash check). Forcing a shared function here would require a mode flag or would silently change one caller's write target or idempotency behavior. Left as a reported finding instead. |
| Did not touch the strategy classes/interface/factory in `plugin/translator/` | Explicitly out of scope per the ticket. `resolveTranslator`, `PluginTranslator`, `BuiltTreeMaterializationTranslator`, `ModeBFlatMaterializationTranslator`, `ModeAMarketplaceTranslator` are all unmodified. |

## Behavioral differences found (not unified, reported as findings)

- Sites 2 and 3 never invoke `ModeAMarketplaceTranslator` at all. Only site 1's
  `addPluginForTool` explicitly dispatches to it (`adapter?.mode === "marketplace" &&
  source.kind === "local"`). For update and restore, a marketplace-mode tool's fallback path
  runs the generic `PluginContentTranslator` instead, gated by the ad hoc
  `isLocalMarketplace` check in site 2 (site 3 has no such gate at all — it always runs the
  generic translate-and-hash-check path for non-built-tree plugins). This existed before this
  story; it was not introduced or fixed here.
- `ModeBFlatMaterializationTranslator` (the flat-mode fallback used by site 1's `adapter
  .addPlugin` call for tools like OpenCode) performs OpenCode MCP entry merging
  (`resolveMcp`/`mergeOpencodeMcpEntries`) as part of `addPlugin`. Sites 2 and 3's own
  fallback paths (`translateWithComponentPaths` / `translate` called directly, not through
  this translator) do not merge MCP entries at all. An OpenCode plugin's MCP servers merged
  on add may not be preserved the same way through an update or a restore. Pre-existing,
  out of scope for this story.
- `ApplyPluginFilesUseCase.restoreViaBuiltTree`'s return value
  (`manifest.getPlugins(toolId).find(...)?.files.size`) is the plugin's *total* file count
  after restore, not a count of files actually rewritten — unlike `restoreViaTranslate`,
  which counts only files it actually wrote. Preserved exactly; not a bug introduced or
  fixed by this refactor.

## Verification

1. `npx tsc --noEmit` — no errors, before and after all edits, and again after restoring
   from both mutation-test edits.
2. `pnpm test` from `cli/` — baseline on `origin/next` measured at 2107 tests / 195 files
   passing before any change. After Phase 1 (characterization tests only): 2109 tests / 196
   files. After Phase 2 (the consolidation, no new tests added): still 2109 tests / 196
   files, all green. No existing test file's assertions were changed; the two files
   modified by Biome auto-formatting only reformatted import statements.
3. Biome, one file per invocation via `./node_modules/.bin/biome check --write <file>`, for
   all 6 changed/added files:
   - `src/application/use-cases/plugin/plugin-add-use-case.ts`
   - `src/application/use-cases/plugin/plugin-helpers.ts`
   - `src/application/use-cases/plugin/plugin-update-use-case.ts`
   - `src/application/use-cases/shared/apply-plugin-files-use-case.ts`
   - `src/application/use-cases/plugin/translator/resolve-plugin-translator.ts`
   - `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit.test.ts`

   Biome auto-fixed import ordering/formatting on 4 of the 6 on first pass (no logic
   changes). A second pass on all 6 reports "No fixes applied" for every file.
4. Coverage of `src/application/use-cases/shared/apply-plugin-files-use-case.ts` (Phase 1,
   measured via `vitest run --coverage --coverage.include=...
   --coverage.reporter=json-summary`):
   - Before: statements/lines 75.94% (60/79), functions 83.33% (5/6), branches 86.95%
     (20/23). The uncovered function was `restoreViaBuiltTree` (statements 73-89, matching
     the ticket's claim exactly) plus the call to it on line 51.
   - After adding `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit
     .test.ts` (2 tests, driving the restore path through `RestoreAllPluginsUseCase` with a
     cursor marketplace plugin, deleting the installed files first to force
     re-materialization): statements/lines 100% (79/79), functions 100% (6/6), branches
     88.46% (23/26). The branch *total* changed from 23 to 26 between the two runs (not just
     the covered count); this was observed, not explained — reporting the raw figures rather
     than theorizing why the denominator moved.
5. Mutation testing, two separate mutations, each reverted before the next and before
   finishing:
   - **Mutation A** — removed the `manifest.removePlugin(toolId, plugin.name)` line from
     `materializeViaBuiltTree`, leaving only the `translator.addPlugin` call. Since every
     translator's `addPlugin` calls `manifest.addPlugin` internally, and `manifest
     .addPlugin` throws `DuplicatePluginError` when the name is already registered, this
     mutation is a hard exception, not a coincidentally-correct write. Running `pnpm test`:
     2 test files failed, 4 tests total —
     `tests/application/use-cases/plugin/plugin-update-built-tree.unit.test.ts` (site 2,
     `PluginUpdateUseCase`) and
     `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit.test.ts` (site 3,
     `ApplyPluginFilesUseCase`/`RestoreAllPluginsUseCase`, the Phase 1 characterization
     tests). Both failed with the identical `DuplicatePluginError`, confirming both callers
     genuinely run the same shared function. Reverted; suite back to 2109/2109.
   - **Mutation B** — made `resolvePluginTranslator` return `null` unconditionally before
     its real logic. Running `pnpm test`: 3 test files failed, 4 tests total —
     `tests/application/use-cases/plugin/plugin-add-use-case.unit.test.ts` (site 1, 2 tests:
     the opencode and cursor "fetches and materializes files" cases, which stopped fetching
     entirely because the flat-mode dispatch never triggered),
     `tests/application/use-cases/plugin/plugin-update-built-tree.unit.test.ts` (site 2, 1
     test), and `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit
     .test.ts` (site 3, 1 test). All three call sites' tests failed, confirming
     `resolvePluginTranslator` is genuinely shared across add, update, and restore. Reverted;
     suite back to 2109/2109, `tsc --noEmit` clean, Biome clean on both touched files.
6. All three translator modes verified still behaving distinctly (unmodified tests, all
   green after the consolidation):
   - flat: `tests/application/use-cases/plugin/plugin-update-built-tree.unit.test.ts`,
     `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit.test.ts`,
     `tests/application/use-cases/plugin/translator/built-tree-opencode-materialization
     .integration.test.ts`, and the opencode/cursor cases in `plugin-add-use-case.unit
     .test.ts`.
   - marketplace: `tests/application/use-cases/plugin/translator/mode-a-marketplace-adapter
     .unit.test.ts`, plus the claude/codex "registers only without writing files" cases in
     `plugin-add-use-case.unit.test.ts`.
   - no-translator (`translationMode: "unsupported"` → `resolveTranslator` returns `null`):
     `tests/application/use-cases/plugin/translator/plugin-translation-adapter-factory
     .unit.test.ts`.
