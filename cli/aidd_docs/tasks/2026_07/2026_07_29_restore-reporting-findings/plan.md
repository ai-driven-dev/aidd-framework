---
objective: "Restore tells the truth about what it did, and marketplace-mode plugins are handled the same way on every command."
status: findings-1-2-done
---

# Plan: three findings surfaced during the cartography backlog

None of these came from a ticket. Each was found while refactoring nearby code, recorded in a PR, and deliberately not fixed at the time to keep those PRs behaviour-preserving.

## Finding 1 — restore silently drops a drifted file (confirmed)

`restore-regular-files-use-case.ts:83-103`. Both drift branches end in the same guard:

```ts
const distFile = distMap.get(manifestFile.relativePath);
if (distFile) drift.push({ ... });
// no else
```

A file the manifest tracks, which is genuinely deleted or modified on disk, is skipped when the current distribution no longer contains it. It is not restored, not counted as kept, and not reported. The user is told restore succeeded while a tracked file stays broken.

This is reachable whenever the manifest outlives the distribution: a file dropped in a newer framework version, or a tool whose content set changed.

**Fix.** Collect these into a distinct outcome rather than dropping them. The skeleton already partitions `restored` / `kept`, so a third category is a natural extension: the entry is drifted, but nothing exists to restore it from. Surface it in the command output as a warning, since a silent success is the actual defect.

## Finding 2 — restore reports two different numbers (confirmed, worse than recorded)

`apply-plugin-files-use-case.ts:70-100`. The same `execute()` returns a count whose meaning depends on which path ran:

| Path | Returns | Honours `fileFilter` |
| ---- | ------- | -------------------- |
| `restoreViaBuiltTree` (line 77) | `plugin.files.size`, every file the plugin has | no |
| `restoreViaTranslate` (line 86-99) | only files actually written | yes |

So on a materializing tool (cursor, opencode), a restore where nothing drifted still reports the full file count as if it had restored everything.

The `fileFilter` half was not in the original note and is the more serious of the two: a scoped restore may write outside its scope on the built-tree path. Whether that is wrong depends on whether a built subtree can be partially copied at all, so it needs checking before changing.

**Fix.** Make `restoreViaBuiltTree` count what it actually wrote, so both paths mean the same thing. Treat the `fileFilter` asymmetry as a separate question and confirm intent before touching it.

## Finding 3 — marketplace-mode plugins take a different path on update/restore (needs verification first)

`resolveTranslator` returns `ModeAMarketplaceTranslator` when `translationMode === "marketplace"` (factory line 44-45). But `plugin-update-use-case.ts` and `apply-plugin-files-use-case.ts` both keep the translator only if it is a `BuiltTreeMaterializationTranslator` and otherwise fall through to `PluginContentTranslator`, which materializes files.

If a tool installs a plugin by registering a reference and writing nothing, then update and restore writing files for it would create content install never produced.

**Not yet actionable.** Two things decide it, and neither is established:

1. which tools actually set `translationMode: "marketplace"`;
2. whether such a plugin has any `files` in the manifest, since if it has none the fall-through iterates nothing and the concern is empty.

A spike answers both before any fix. Consistent with the rest of this backlog, this may end up infirmed.

## Order

1. Spike finding 3 (cheap, decides whether it is real).
2. Fix finding 1, with a test proving the dropped entry is now reported.
3. Fix finding 2's count, with a test proving a no-op restore on the built-tree path reports zero.
4. Fix finding 3 only if the spike confirms it.

Findings 1 and 2 both change user-visible output. That is the point in both cases: the current output is wrong.

## What actually happened (2026-07-29)

Findings 1 and 2 fixed. Finding 3 untouched — still needs its spike before any code change, and wasn't in this pass's scope.

### Finding 1

Added a third outcome, named `unrestorable`, to the shared drift skeleton (`restore-drift-entries-use-case.ts`): `DriftCollection<TDrift>` is now `{ drift, unrestorable }`, and `RestoreDriftLeaf.buildResult` takes `(restored, kept, unrestorable)`. The null short-circuit (`collectDrift` found nothing at all) now checks both arrays, so a tool with only unrestorable entries no longer collapses to a silent no-op.

Both leaves (`restore-regular-files-use-case.ts`, `restore-merge-files-use-case.ts`) were rewritten to separate "did this drift" (independent of the dist map) from "can we restore it" (dist map lookup) — previously those were fused, which is exactly how the entry vanished with no `else`.

The merge path had the same hole, confirmed by tracing it, not assumed: `collectMergeDrift`'s `if (!distFile || distFile.mergeStrategy === "none") continue;` silently dropped genuinely-drifted files under both conditions. Both are now routed to `unrestorable` — a file the current distribution no longer merge-tracks (dropped entirely, or its strategy became `"none"`) has nothing left to restore drift from, same as the regular-files case. An existing test asserting `mergeStrategy: "none"` silently returns `null` was renamed and its assertion changed (see below); a second test was added confirming `"none"` with *no* actual drift still correctly returns `null` (the "not drifted at all" case wasn't part of the bug and stays untouched).

The count flows up unchanged in shape: `RestoreToolFilesResult`, `RestoreResult` (restore-use-case.ts), and `RestoreAllResult` (restore-all-use-case.ts) each gained an `unrestorable: string[]` field, aggregated by concatenation/flatMap at each layer — never counted as `restored`.

Surfaced to the user as a warning line in all three command entry points that report restore results: `aidd restore` (restore.ts), `aidd ide restore` (ide.ts), `aidd ai restore` (ai.ts). Each now emits, when `unrestorable.length > 0`:

```
Could not restore N file(s) no longer part of the current distribution: <names>
```

The "nothing to restore" success gate in all three now also checks `unrestorable.length === 0`, so a tool with only unrestorable entries no longer reports false success.

### Finding 2

`restoreViaBuiltTree` no longer reads `manifest.getPlugins(toolId).find(...)?.files.size` after the fact. `materializeViaBuiltTree` (plugin-helpers.ts) now returns the actual number of files (re)written, and `BuiltTreeMaterializationTranslator.addPlugin` computes that count itself: it now skips writing (and doesn't count) any file whose disk content already matches the built-tree content, mirroring `restoreViaTranslate`'s `isFileAtDesiredState` check exactly — both paths now call the same extracted helper, `isPluginFileAtDesiredState` in plugin-helpers.ts. This was necessary, not just a reporting fix: the built-tree write step previously overwrote every file unconditionally every restore, so "how many files were written" and "the plugin's total file count" were the same number by construction. Making the count honest required making the write conditional.

`BuiltTreeMaterializationTranslator.addPlugin`'s own return type is widened to `{ skipped; written?: number }` (not the shared `PluginTranslator` interface, which stays `{ skipped }` — this class is always consumed through its concrete type at the two call sites that need the count). `written` is `undefined` only on the rare fallback branch (marketplace lookup fails at restore time and materialization delegates to `ModeBFlatMaterializationTranslator`); `materializeViaBuiltTree` reports that as `0` rather than guessing, since undercounting is safer than falsely claiming files changed.

**fileFilter read-only finding:** `restoreViaBuiltTree` still ignores `fileFilter` — confirmed, not changed. `BuiltTreeMaterializationTranslator` reads the entire built subtree for a plugin from disk (`readBuiltFiles`/`readFlatFiles`, driven by `listFilesRecursive` over the built dir) and writes it as one unit; there is no per-file hook into that read step that a `fileFilter` predicate could gate without restructuring how the built tree is enumerated. Recommendation: treat verbatim-subtree-copy as intentional for this translator (it exists specifically so restored bytes match `framework build` output 1:1) and either (a) accept that `--files` scoping doesn't apply to built-tree-materialized tools (cursor/opencode plugins) and say so in `--help`/docs, or (b) if partial restore of a built subtree is actually wanted, filter the file list returned by `readBuiltFiles`/`readFlatFiles` before `writeChangedFiles` — a small, isolated change, but a product decision (does "restore only these files" mean anything for a tool that's supposed to mirror the build verbatim?) rather than a bug fix.

### Existing test assertions changed

1. `restore-regular-files-use-case.unit.test.ts`: the two tests titled *"silently drops a \[deleted/modified\] file that has no corresponding entry in the dist map"* asserted `result === null` and the file left untouched. Renamed to *"reports a \[deleted/modified\] file with no corresponding dist entry as unrestorable, without touching disk"*; assertions changed to `result?.unrestorable === ["a.md"]`, `restored === []`, `kept === []`, disk still untouched. This is the literal behavior the finding says was wrong — the old assertion encoded the bug.
2. `restore-merge-files-use-case.unit.test.ts`: *"skips merge files whose distribution strategy is 'none'"* asserted `result === null` for a file that was genuinely drifted on disk. Renamed to *"reports a drifted merge file as unrestorable when the distribution strategy is 'none'"*; assertions changed to `unrestorable === ["a.json"]`, disk untouched. Added a new sibling test, *"returns null when a merge file's distribution strategy is 'none' and nothing drifted"*, to keep the genuinely-inert case (no drift at all) covered as returning `null`, since that part of the old test's premise was correct and shouldn't regress.

### New tests

- Two regression tests above (deleted/modified file dropped from dist map) in `restore-regular-files-use-case.unit.test.ts`.
- One regression test in `restore-merge-files-use-case.unit.test.ts` (mergeStrategy `"none"` with real drift).
- One in `apply-plugin-files-built-tree.unit.test.ts`: *"reports zero files restored when a built-tree restore finds nothing drifted"* — seeds the user-scope plugin dir with content identical to the built tree, then asserts `result.totalFiles === 0`. (Note: had to seed disk directly rather than rely on the preceding install, because the test helper's `installMarketplacePlugin` uses `PluginAddUseCase`'s default `os.homedir()` while `makeRestoreUseCase` injects a fake `homedir: () => "/home/u"` — those two write to different base directories in this test file already, unrelated to this fix, left as-is.)

### Verification

- `npx tsc --noEmit`: clean.
- `pnpm test` (full build + vitest): 198 files, **2146 tests**, 0 failures (baseline was 2144; net +2 from the new merge-drift and built-tree no-op tests — the two regular-files tests were renamed in place, not added).
- Biome: every changed file individually reports "No fixes applied" after one `--write` pass (two files needed one auto-format pass for a line-wrap, then were clean).
- Golden baseline e2e (`tests/golden/golden-baseline.e2e.test.ts`): passed unchanged, no regeneration needed — its only restore scenario (`restore --force` with nothing modified) has zero unrestorable entries, so output is byte-identical.
- Mutation testing: reverted each fix to its buggy form one at a time, confirmed exactly the new/changed tests failed (and only those), then restored the fix and re-ran the full suite green.
  - Finding 1: reverted `collectDrift`'s dist-map-miss branch back to a silent `continue`. Both new regular-files tests failed with `result === null` where `unrestorable: ["a.md"]` was expected — 2/2146 failed.
  - Finding 1 (merge): reverted the merge leaf's dist-map/`"none"` branch back to a silent `continue`. The new merge test failed the same way — 1/2146 failed.
  - Finding 2: reverted `restoreViaBuiltTree` back to `manifest.getPlugins(...).files.size`. The new built-tree no-op test failed (`1` instead of `0`) — 1/2146 failed.
