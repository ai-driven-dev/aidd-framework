---
objective: "aidd ai/ide restore --tool <x> never touches another tool's plugin files, and aidd restore (global) writes/verifies each plugin file exactly once per invocation."
status: implemented
---

# Plan: BUG-E3-02 — restore plugin scope + single materialization

## Overview

| Field      | Value                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Fix the confirmed scope leak (A2) and double plugin materialization (A3) on `aidd restore`/`aidd ai restore`/`aidd ide restore`. |
| **Source** | `aidd_docs/tasks/2026_07/2026_07_22_aidd-tool-contract-cartography/epic-E3-restore-uninstall-integrity.md` (BUG-E3-02, fed by SPIKE-E3-01's confirmed findings) |

## Phases

| #   | Phase                                          | File                          |
| --- | ------------------------------------------------ | ------------------------------ |
| 1   | Thread `--tool` scope into plugin restore (A2)    | [`phase-1.md`](./phase-1.md) |
| 2   | Collapse the double plugin-restore pass (A3)      | [`phase-2.md`](./phase-2.md) |

## Resources

None external — pure internal codebase tracing, findings already cited with file:line in SPIKE-E3-01's result section.

## Decisions

| Decision | Why |
| -------- | --- |
| Split into 2 phases instead of 1 combined fix | A2's fix (thread `ctx.toolIds` into `RestoreAllPluginsUseCase`) is a small, additive, non-breaking param. A3's fix (collapse `RestoreAllUseCase`'s two passes) requires a return-type change that ripples through `RestoreAllPluginsUseCase` → `RestoreUseCase` → `RestoreAllUseCase` to preserve the `pluginNamesRestored` CLI output (`restore.ts:31-33`, "Restored plugins: x, y, z"). Landing A2 first, green, before touching the return-type ripple for A3 keeps each phase independently assertable and revertable. |
| Delete `RestorePluginUseCase` (`src/application/use-cases/restore/restore-plugin-use-case.ts`) once phase 2 lands, plus its dedicated unit test | It has exactly one caller in `src/` today — `RestoreAllUseCase.restoreAllPlugins()`, the very pass being removed. Confirmed via grep: no other command or use-case references it. Keeping it around unreferenced would violate the project's dead-code rule (YAGNI/clean-code). |
| Do not reproduce `RestorePluginUseCase`'s "throws `PluginNotFoundError` for a nonexistent plugin" test scenario elsewhere | That scenario only made sense for a single-named lookup. In its one real call site, the name always came from enumerating the same manifest instance (`collectAllPluginNames`), so a plugin already up-to-date (0 files needing restore) would incorrectly throw `PluginNotFoundError` too — a latent false-error bug, not a real not-found case. Collapsing to the single pass removes this call path entirely, so the scenario has no equivalent context to port to; not reproducing it is a side-effect of the fix, not a coverage regression. |
| `pluginNames` in the new `RestoreAllPluginsUseCase` return only includes a plugin if ≥1 file was actually written for it | Matches user-facing intent ("Restored plugins: x, y") — a plugin with nothing to restore should not be listed as restored. This differs slightly from the old buggy behavior (which listed a plugin's name whenever `RestorePluginUseCase.execute` didn't throw, but threw for already-up-to-date plugins instead of just reporting zero) — this is a direct, unavoidable side-effect of removing the buggy call path, not separate scope creep. |
| Unscoped `aidd ide restore` (no `--tool`) will stop restoring AI-tool plugins entirely, where today it restores all of them | `ide.ts` only ever passes IDE tool ids into `ctx.toolIds`. Once that list gates the plugin-restore pass (phase 1), `AI_TOOL_IDS ∩ ctx.toolIds` is empty for any ide-originated call, scoped or not — an ide restore has no business touching AI plugins in the first place. This is the correct fix, not a side effect to hide, but it IS a behavior change from today and needs its own test (phase 1) and its own line here so the approver isn't surprised by it. |
| After collapsing to one pass (phase 2), an explicit/interactive file selection on the global `aidd restore` now excludes ALL plugin files, not just unselected ones — where today Pass 2 always fully restored every plugin regardless of selection | Verified in `apply-plugin-files-use-case.ts`: `restoreViaTranslate` already reads `fileFilter` and Pass 1 already threads `ctx.fileFilter` through — but `RestorePluginUseCase.applyPluginForTool` (Pass 2, deleted) never passed `fileFilter` at all, so Pass 2 unconditionally re-restored every plugin a moment after Pass 1 correctly skipped unselected ones. Discovered during phase 2 testing: `RestoreAllUseCase.promptForFiles` builds its checkbox choices only from `report.tools[].drifted` — it never reads `report.pluginDrift`, so a plugin file can never be an explicit checkbox choice in the first place. Net effect: once the user selects ANY specific regular file, `fileFilter` turns on and no plugin path can ever match it (all-or-nothing, not per-plugin). This exact mechanism already applies today to `ai.ts`/`ide.ts`'s `restore <file>` (they always threaded `ctx.fileFilter` to plugin restore too) — phase 2 only makes the global command consistent with that pre-existing behavior, not new. Built-tree tools (cursor/opencode) are unaffected either way: `restoreViaBuiltTree` doesn't accept `fileFilter` at all. |
| Relying on `RestoreUseCase.saveIfChanged`'s existing gate (`totalPluginFilesRestored > 0`) to decide whether to persist the manifest after the collapsed single pass, instead of Pass 2's old unconditional `manifestRepo.save()` | This gate is not new — `ai.ts`/`ide.ts` restore commands already flow through this exact gate today for plugin restores (they call `RestoreUseCase` directly, never `RestoreAllUseCase`). The only new thing is the *global* `aidd restore` command now also going through it. `ApplyPluginFilesUseCase` recomputes each plugin's file/hash map on every call regardless of whether anything changed (`updatePlugin`/`removePlugin`+`addPlugin`), but that recomputation is deterministic — when 0 files needed restoring, the recomputed content is identical to what's already persisted, so skipping the save changes nothing observable on disk. Verified by reasoning through `manifest.ts:312-340`, not assumed. |

## Out-of-scope discovery (not fixed here, flagged for the backlog)

`RestoreAllUseCase.runConfigRestore` never passes `frameworkPath` to `RestoreUseCase.execute()` (confirmed: `ai.ts`/`ide.ts` don't either). `RestoreUseCase.buildRestoreContext` only populates `contentFiles` (used to regenerate `CONFIG_REFS`-driven content — `mcp.json`, `vscode/settings.json`, `vscode/keybindings.json`, `vscode/extensions.json`, `opencode.json`) `if (options.frameworkPath)`. Without it, `RestoreRegularFilesUseCase.collectDrift` can detect a hash mismatch on these files but silently can't push a restorable drift entry (`distMap.get(...)` returns `undefined`, guarded by `if (distFile)`), so these specific files are effectively never repairable via any restore command today. Discovered incidentally while building phase 2's interactive-selection test (had to switch to a plain tracked file, `.vscode/keybindings.json`'s *detection* only, not its restoration). Pre-existing, unrelated to A2/A3, not fixed by this ticket — worth its own spike in the backlog.
