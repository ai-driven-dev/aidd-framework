---
objective: "aidd ide uninstall removes the settings keys it merged in, instead of leaving them orphaned in shared files."
status: in-progress
---

# Plan: SPIKE-E3-03 + BUG-E3-04 — ide uninstall cleans its merge-file entries

## Overview

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Goal**   | `UninstallIdeUseCase` stops ignoring merge files; it delegates to the removal logic the AI path already gets right. |
| **Source** | `epic-E3-restore-uninstall-integrity.md` (SPIKE-E3-03, BUG-E3-04 — cartography items A4, A20) |

## Phases

| #   | Phase                                    | File                          |
| --- | ------------------------------------------ | ------------------------------ |
| 1   | Delegate IDE uninstall to the shared remover | [`phase-1.md`](./phase-1.md) |

## Spike findings (SPIKE-E3-03) — confirmed, and the asymmetry is real

`UninstallIdeUseCase.deleteTrackedFiles` iterates `manifest.getToolFiles(toolId)` only. `getMergeFiles(toolId)` is never read, so every key the tool merged into a shared file survives uninstall — while `manifest.removeTool()` drops the record of them, making the leftovers permanently untracked.

**What vscode actually leaves behind** (`domain/tools/ide/vscode.ts`):

| declared settings file | mergeStrategy | on `ide uninstall vscode` today |
| --- | --- | --- |
| `.vscode/keybindings.json` | `none` → regular file | deleted correctly |
| `.vscode/extensions.json` | `user-prime` → merge file | **orphaned** |
| `.vscode/settings.json` | `user-prime` → merge file | **orphaned** |

**The AI path already does this correctly.** `UninstallToolsUseCase.removeMergeFile` strips only the tracked keys, consults `computeDeletePermission` so a file co-owned by another installed tool is not destroyed, honours `sectionKey`, and deletes the file only once nothing is left. That is precisely the asymmetry A4/A20 describe.

`.vscode/settings.json` is genuinely co-owned: copilot (an AI tool) declares a `SettingsCapability` writing into it with `requiresTool: "vscode"`. So the shared-ownership check is not hypothetical here — it is the A20 scenario.

## Decisions

| Decision | Why |
| -------- | --- |
| Delegate to `UninstallToolsUseCase` rather than copy its merge-file handling into the IDE use-case | It is already category-agnostic — `toolIds: ToolId[]`, guards with `isAiTool`, and `removeAllPluginFiles` is a natural no-op for an IDE tool since `getPlugins` returns nothing for one. Reimplementing key-stripping, shared-ownership and section-key logic a second time is how the two paths diverged in the first place. |
| Keep manifest load/validate/save in `UninstallIdeUseCase` | `UninstallToolsUseCase` deliberately takes a manifest and does not persist it, so its caller controls the transaction. Preserving that split keeps the IDE command's existing `NoManifestError` / `ToolNotInstalledError` behaviour untouched. |
