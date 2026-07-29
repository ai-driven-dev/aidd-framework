---
objective: Stop plugin update and restore from materializing files on disk for Mode A marketplace tools (claude/codex/copilot), whose whole contract is register-only, no materialization.
status: implemented
---

## Baseline

Confirmed 2146 passing tests before touching anything (`pnpm test` from `cli/`, 198 files).

## What was verified before fixing

Every claim in the finding was checked against the code, not assumed:

- `translationMode: "marketplace"` is set on exactly three tools: `src/domain/tools/ai/claude.ts:110`, `codex.ts:235`, `copilot.ts:325`.
- `resolveTranslator` (`plugin-translator-factory.ts:44-45`) routes any `PluginsCapability` with `translationMode === "marketplace"` to `new ModeAMarketplaceTranslator()`.
- `ModeAMarketplaceTranslator.addPlugin` (`mode-a-marketplace-translator.ts:32`) calls `manifest.addPlugin(toolId, Plugin.fromDistribution(dist, source, [], new Map(), marketplace))` — an empty files array, unconditionally. Its docstring: "Plugin files are NOT materialized on disk ... the marketplace sync handles the rest."
- `PluginUpdateUseCase.replacePluginFiles` kept the resolved translator only when `translator instanceof BuiltTreeMaterializationTranslator` (used by cursor/opencode). For claude/codex/copilot the resolved translator is `ModeAMarketplaceTranslator`, which fails that check, so the code fell through to a raw `PluginContentTranslator` + `writePluginFiles` path guarded by `isLocalMarketplace = plugin.source.kind === "local" && plugin.marketplace !== undefined`.
- Traced how a github-sourced marketplace plugin actually gets its `source.kind`: `resolvePluginSourceFromMarketplace` (`plugin-source-resolver.ts`) turns a catalog entry into `{ kind: "git-subdir", ... }` whenever the marketplace itself is `kind: "github"`. So a plugin installed from a github-hosted marketplace has `source.kind === "git-subdir"`, never `"local"`. `isLocalMarketplace` is therefore false for exactly the case that matters, and update wrote files that install never wrote, recording them in the manifest.
- `ApplyPluginFilesUseCase` (restore) has the identical `instanceof BuiltTreeMaterializationTranslator` gate, but its fallback (`restoreViaTranslate`) has **no** `isLocalMarketplace` guard at all — it unconditionally writes translated files and updates the manifest with them for every plugin that doesn't hit the built-tree branch. Restore had the same defect, unconditionally, for every marketplace-mode plugin regardless of source kind.
- Cross-checked against install (`PluginAddUseCase`): a plugin catalogued in a `kind: "github"` marketplace goes through `addGithubMarketplacePlugin`, which bypasses `PluginContentTranslator` entirely and calls `manifest.addPlugin(toolId, Plugin.fromMetadata(...))` with no files — confirming install already gets this right and update/restore were the only broken paths.

All claims held; nothing in the finding was wrong.

## The fix

`resolvePluginTranslator(toolConfig, deps)` already returns the correct strategy for a tool — `BuiltTreeMaterializationTranslator` for cursor/opencode, `ModeAMarketplaceTranslator` for claude/codex/copilot, or `null` for plain native tools. The bug was that both call sites narrowed that result with `instanceof BuiltTreeMaterializationTranslator`, silently discarding the Mode A case and falling back to a generic materializing path with an ad-hoc `source.kind === "local"` special case bolted on.

The fix removes the `instanceof` narrowing and the `isLocalMarketplace` special case entirely. Both `PluginUpdateUseCase.replacePluginFiles` and `ApplyPluginFilesUseCase.execute` now do:

```
const translator = this.resolveTranslator(toolConfig);   // PluginTranslator | null, no instanceof filter
if (translator !== null && plugin.marketplace !== undefined) {
  return materializeViaTranslator(translator, dist, toolId, plugin, projectRoot, manifest, docsDir);
}
// else: plain native materialization (unchanged raw-translate path)
```

`materializeViaBuiltTree` (in `plugin-helpers.ts`) was generalized to `materializeViaTranslator`, widening its parameter type from `BuiltTreeMaterializationTranslator` to the `PluginTranslator` interface. Its body was already translator-agnostic (`manifest.removePlugin` then `translator.addPlugin`, reporting `written ?? 0`), so no logic changed — only the type. This is why the seam is a widening, not a new branch: `PluginTranslator.addPlugin` is a uniform contract (both `BuiltTreeMaterializationTranslator` and `ModeAMarketplaceTranslator` implement it), and the return type gained an optional `written?: number` field so the shared helper compiles against either implementation (`ModeAMarketplaceTranslator.addPlugin` never sets it, so `written ?? 0` correctly reports zero files written for Mode A).

No `if (toolId === "claude")`-style branching was added anywhere. The dispatch is entirely driven by what `resolvePluginTranslator` returns for that tool's `PluginsCapability`, exactly as install already does it.

### Why `plugin.marketplace !== undefined` stays as a guard

This condition already existed before the fix and was kept unchanged. It matters for both translator kinds: `BuiltTreeMaterializationTranslator.addPlugin` has its own internal fallback when `marketplace === undefined` (delegates to `ModeBFlatMaterializationTranslator`), and install's own Mode A branch (`plugin-add-use-case.ts` line 278) only calls the adapter when `marketplace !== undefined` too — a plugin added directly from a local path (no marketplace) on a marketplace-mode tool is deliberately materialized via the generic writePluginFiles path, matching what install does for that same case. The fix preserves this exactly; the condition text is identical to what it was, just no longer combined with the `instanceof` check.

## Migration: what happens to already-materialized files

A user who ran `plugin update` (or `restore`) against the pre-fix code on a github-sourced marketplace plugin now has stray files on disk under `.claude/plugins/<name>/...` (or the codex/copilot equivalent) plus a manifest entry recording them.

Behavior after deploying the fix, verified by reading the final code (not assumed):

- **`plugin update`, when a newer plugin version exists upstream**: self-heals. `replacePluginFiles` unconditionally calls `deleteOldFiles(plugin.files, baseDir)` *before* branching on the translator — using the stale manifest entry's (buggy, non-empty) `files` map. This deletes every stray file, then the Mode A branch re-registers the plugin with an empty files list. No orphans remain.
- **`plugin update`, when no newer version exists**: `updateOnePlugin` returns early (`compareSemver(...) <= 0`) without calling `replacePluginFiles` at all. The stray files and the wrong manifest entry are left untouched indefinitely — update never even looks at this plugin again until a new version ships.
- **`plugin restore`**: does **not** self-heal. `ApplyPluginFilesUseCase` has no equivalent `deleteOldFiles` step anywhere in the file — `restoreViaTranslate` only ever writes/overwrites files it currently computes, never deletes files absent from that set. After the fix, restore re-registers the manifest entry as empty via the Mode A branch, but the previously-materialized files stay on disk, now **orphaned and untracked** (previously they were at least recorded, if wrongly; after restore they're invisible to the manifest entirely).

### Implemented: restore now self-heals

`deleteOldFiles` was extracted from `PluginUpdateUseCase` into a shared, exported function in `plugin-helpers.ts` (`deleteOldFiles(files, baseDir, fs)`), and `ApplyPluginFilesUseCase.restoreViaTranslator` calls it as a new, narrowly-gated step:

```ts
if (translator.mode === "marketplace" && this.builtDeps !== undefined) {
  const baseDir = resolvePluginBaseDir(toolId, projectRoot, this.builtDeps.homedir);
  await deleteOldFiles(plugin.files, baseDir, this.fs);
}
```

Safety bounds, checked against the final code:

- **Manifest-scoped only.** `deleteOldFiles` iterates `plugin.files.keys()` — the manifest's own tracked paths — and joins each to `baseDir`. It never lists a directory and never deletes by glob or pattern. A file physically present in the same plugin directory but absent from the manifest entry is untouched (covered by a dedicated test — see below).
- **Marketplace/Mode A branch only.** The gate is `translator.mode === "marketplace"`, the exact discriminant `resolveTranslator` (`plugin-translator-factory.ts:31-48`) uses to hand out `ModeAMarketplaceTranslator`. `BuiltTreeMaterializationTranslator` (cursor/opencode) and the `restoreViaTranslate` fallback (flat mode / non-marketplace installs) declare `mode: "flat"` or never reach this method at all, so the delete is structurally unreachable for them — confirmed by grepping `readonly mode` across every translator implementation.
- **Bounded to the plugin's base dir.** `baseDir` comes from `resolvePluginBaseDir(toolId, projectRoot, homedir)`, the same resolver `PluginUpdateUseCase` uses — not a hardcoded `projectRoot`. Checked that all three Mode A tools (claude, codex, copilot) default to `installScope: "project"` (none sets `installScope: "user"`), so `baseDir === projectRoot` for all three today, but the code doesn't assume that.
- **Missing-file safe.** Both the real `FileAdapter.deleteFile` (`rm(path, { force: true })`) and the in-memory test adapter (`Map.delete`) are no-ops on a path that doesn't exist, so a partially-cleaned install (some stray files already removed by hand) can't crash restore.

`PluginUpdateUseCase.replacePluginFiles` was refactored to call the same shared `deleteOldFiles` (previously a private method with an identical body) instead of duplicating it — its call stayed in the same unconditional position it already had, before the translator branch, since that unconditional delete is by design (it also clears files removed between versions on the built-tree and translate-fallback paths, not just the Mode A case). Only restore's new call is gated on `mode === "marketplace"`; the shared function itself carries no branch logic.

This closes a gap the original fix didn't: `plugin update` only self-heals when a newer version exists upstream (`updateOnePlugin` returns early via `compareSemver` otherwise, per the trace above) — a plugin already on the latest version never gets its stray files cleared by update, ever. `restore` has no such version gate, so it is now the reliable self-heal path for stray Mode A files regardless of whether an upstream update is available.

### Tests

Added to `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts`:

- "cleans up files a pre-fix update/restore materialized, leaving the manifest entry empty" — seeds a manifest entry with a stray non-empty `files` map (simulating a pre-fix run) plus matching files on disk, restores, and asserts both the files and the manifest entries are gone.
- "leaves a file the manifest never tracked untouched, even inside the plugin's own directory" — the safety-critical test. Places an untracked file (`.claude/plugins/sample-plugin/notes.md`) alongside a tracked stray file in the *same* plugin directory, restores, and asserts the untracked file survives with its exact original content while the tracked one is gone. Proves the cleanup is manifest-scoped, not directory-scoped.
- The existing "restores ... without materializing any files" test in the same file already covers the no-op case (empty manifest entry → `deleteOldFiles` iterates zero keys).
- Regression coverage for built-tree (cursor/opencode) and translate-fallback (flat/local-source) restores was not duplicated — `apply-plugin-files-built-tree.unit.test.ts` and `restore-all-use-case.unit.test.ts` (`restoreViaTranslate` for both claude-local and cursor-local installs) already exercise those paths and stayed green through this change, since the new delete is structurally unreachable from them.

Mutation test: temporarily forced the new `if` guard to `false` (dead code). Both new tests failed with the exact predicted symptom (`expected 'stray content' to be undefined`) — one on the stray-file assertion, one on the tracked-file-gone assertion inside the untracked-survives test. Reverted; full suite re-confirmed green at 2152/2152.

## Tests

Characterization tests were run against the pre-fix code first (via `git stash` of the four production-code changes), confirmed to fail with the exact described symptom, then the fix was restored and the tests confirmed green — so the diff demonstrably flips the behavior:

- `tests/application/use-cases/plugin/plugin-update-mode-a-marketplace.unit.test.ts`: a github-sourced (`git-subdir`) marketplace plugin on claude, updated via `PluginUpdateUseCase`. Asserts zero files under `.claude/plugins/` and an empty `plugin.files` map after update, plus a single non-duplicated manifest entry. A third test in the same file installs the same plugin on **opencode** (flat-mode) and asserts it still re-materializes from the built tree on update — the regression guard for the shared code path.
- `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts`: same github-sourced plugin on claude, restored via `RestoreAllPluginsUseCase`. Asserts `result.totalFiles === 0`, no files under `.claude/plugins/`, and a single manifest entry with empty files.

Pre-fix run of these two files: 3 of 4 tests failed with "expected 6 to be 0" (6 = files the fixture plugin contains) and one "expected undefined to be 'aidd-framework'" (duplicate-registration path threw before reaching that assertion cleanly); the opencode regression test passed both before and after, as expected since it exercises a code path the fix does not touch.

Existing coverage left untouched and still green, providing independent regression evidence:
- `tests/application/use-cases/plugin/plugin-update-built-tree.unit.test.ts` (cursor update via built tree)
- `tests/application/use-cases/shared/apply-plugin-files-built-tree.unit.test.ts` (cursor restore via built tree)
- `tests/application/use-cases/plugin/translator/built-tree-opencode-materialization.integration.test.ts` (opencode translator-level)
- `tests/application/use-cases/plugin/translator/install-plugin-{claude,codex,copilot}-mode-a.integration.test.ts` (install-side Mode A behavior, unchanged)

## Checked fact: cursor/opencode/flat-mode tools are unaffected

Read directly from the final code, not inferred:

- `PluginsCapability.resolveTranslationMode` (`plugins-capability.ts:175-179`) hardcodes `translationMode = "flat"` whenever `params.mode === "flat"` (opencode), and native tools only get `"marketplace"` when explicitly configured with it (claude/codex/copilot). Cursor uses `mode: "native"` with `installScope: "user"` and no `translationMode` set, so its `translationMode` resolves to `null`.
- `resolveTranslator` (`plugin-translator-factory.ts:35`) routes `installScope === "user"` (cursor) or `translationMode === "flat"` (opencode) to `BuiltTreeMaterializationTranslator`, and only checks `translationMode === "marketplace"` afterward. Structurally, for cursor and opencode, `resolveTranslator` can only ever return `BuiltTreeMaterializationTranslator` or (if `builtDeps` is unset) `null` — it can never return `ModeAMarketplaceTranslator`, because the `translationMode === "flat"` / `installScope === "user"` branch returns first.
- Therefore `translator !== null && plugin.marketplace !== undefined` (the new condition) is provably equivalent to the old `translator instanceof BuiltTreeMaterializationTranslator && plugin.marketplace !== undefined` for these two tools specifically, since `translator` can never be anything other than `BuiltTreeMaterializationTranslator` or `null` for them. No behavior change is possible for cursor/opencode from this fix.

## Verification (real numbers)

1. `npx tsc --noEmit` — clean, no errors.
2. `pnpm test` from `cli/` — 200 test files, **2150 tests passed**, zero failures. Baseline was 2146; this task added 4 new characterization/fix tests (3 in `plugin-update-mode-a-marketplace.unit.test.ts`, 1 in `apply-plugin-files-mode-a-marketplace.unit.test.ts`), for 2146 + 4 = 2150. No existing assertion was modified.
3. Biome, one file at a time via `./node_modules/.bin/biome check --write <file>`:
   - `src/application/use-cases/plugin/plugin-helpers.ts` — no fixes applied.
   - `src/application/use-cases/plugin/plugin-update-use-case.ts` — fixed formatting once (line wrap on a multi-arg call), second run: no fixes applied.
   - `src/application/use-cases/shared/apply-plugin-files-use-case.ts` — fixed formatting once (same kind of wrap), second run: no fixes applied.
   - `src/application/use-cases/plugin/translator/plugin-translator.ts` — no fixes applied.
   - `tests/application/use-cases/plugin/plugin-update-mode-a-marketplace.unit.test.ts` — no fixes applied.
   - `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts` — no fixes applied.
4. Mutation test: `git stash` of the four production-code changes (reverting to the exact pre-fix state) while keeping the two new test files. Ran the two new test files: 3 of 4 tests failed, each with the precise symptom the finding predicted (files materialized where none should be: "expected 6 to be 0"; a duplicate-registration assertion failing because the buggy path never emptied `files`). The opencode regression test in the same file passed unaffected, confirming it doesn't accidentally depend on the fix. `git stash pop` restored the fix; re-ran `npx tsc --noEmit` (clean) and `pnpm test` (2150/2150 green again).
5. Golden baseline: `tests/golden/golden-baseline.e2e.test.ts` ran as part of the full suite and passed unchanged (2/2), meaning its command matrix doesn't currently exercise a github-sourced marketplace plugin update/restore. No `UPDATE_GOLDEN=1` regeneration was needed or performed.

## Files changed

- `src/application/use-cases/plugin/plugin-helpers.ts` — `materializeViaBuiltTree` → `materializeViaTranslator`, widened to `PluginTranslator`.
- `src/application/use-cases/plugin/plugin-update-use-case.ts` — `replacePluginFiles` routes through the resolved translator generically; `isLocalMarketplace` special case removed; `builtTreeTranslator` → `resolveTranslator`.
- `src/application/use-cases/shared/apply-plugin-files-use-case.ts` — same shape of change for restore; `builtTreeTranslator` → `resolveTranslator`; `restoreViaBuiltTree` → `restoreViaTranslator`.
- `src/application/use-cases/plugin/translator/plugin-translator.ts` — `addPlugin`'s return type gained an optional `written?: number` so the shared helper can report it uniformly across strategies.
- `tests/application/use-cases/plugin/plugin-update-mode-a-marketplace.unit.test.ts` — new.
- `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts` — new.

## Restore self-heal follow-up — verification (real numbers)

1. `npx tsc --noEmit` — clean, no errors.
2. `pnpm test` from `cli/` — 200 test files, **2152 tests passed**, zero failures. Baseline for this follow-up was the 2150 above; added 2 new tests (both in `apply-plugin-files-mode-a-marketplace.unit.test.ts`). No existing assertion was modified.
3. Biome, one file at a time via `./node_modules/.bin/biome check --write <file>`:
   - `src/application/use-cases/plugin/plugin-helpers.ts` — no fixes applied.
   - `src/application/use-cases/plugin/plugin-update-use-case.ts` — no fixes applied.
   - `src/application/use-cases/shared/apply-plugin-files-use-case.ts` — no fixes applied.
   - `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts` — no fixes applied.
4. Mutation test: forced the new `if (translator.mode === "marketplace" && this.builtDeps !== undefined)` guard to `&& false`, making the cleanup dead code. Both new tests failed with the exact predicted symptom (`expected 'stray content' to be undefined`). Reverted; `pnpm test` re-confirmed 2152/2152 green.
5. Golden baseline: `tests/golden/golden-baseline.e2e.test.ts` passed unchanged (2/2) as part of the full suite; no regeneration needed.

## Follow-up files changed

- `src/application/use-cases/plugin/plugin-helpers.ts` — added exported `deleteOldFiles(files, baseDir, fs)`.
- `src/application/use-cases/plugin/plugin-update-use-case.ts` — private `deleteOldFiles` method removed; now calls the shared function in the same unconditional position.
- `src/application/use-cases/shared/apply-plugin-files-use-case.ts` — `restoreViaTranslator` calls `deleteOldFiles` gated on `translator.mode === "marketplace"`.
- `tests/application/use-cases/shared/apply-plugin-files-mode-a-marketplace.unit.test.ts` — 2 new tests (stray-file cleanup, untracked-file survives).
