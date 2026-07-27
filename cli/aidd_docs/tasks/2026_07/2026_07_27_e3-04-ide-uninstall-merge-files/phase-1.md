---
status: done
---

# Instruction: Delegate IDE uninstall to the shared remover

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/
    │   ├── application/use-cases/uninstall/uninstall-ide-use-case.ts  ✏️ modify (delegate)
    │   └── infrastructure/deps.ts                                      ✏️ modify (inject remover)
    └── tests/application/use-cases/
        └── uninstall-ide-use-case.unit.test.ts                         ✅ create
```

## Tasks to do

### `1)` Delegate the deletion

1. Inject `UninstallToolsUseCase` into `UninstallIdeUseCase`.
2. `execute()` keeps loading the manifest, the `NoManifestError` / `ToolNotInstalledError` guards, and the final `save()`; the deletion itself becomes one delegated call.
3. Drop `deleteTrackedFiles` and the now-unused `removeTool` call — the delegate already removes the tool from the manifest.

### `2)` Wire it

1. `deps.ts` constructs `UninstallToolsUseCase` once and passes it to `UninstallIdeUseCase`.

### `3)` Cover the orphaned keys

1. Install vscode, assert aidd's keys land in `.vscode/settings.json` alongside a pre-existing user key.
2. Uninstall, assert the tracked keys are gone and the user's key survives.
3. Assert a merge file co-owned by a still-installed tool is not destroyed.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| 1-2  | After `aidd ide uninstall vscode`, no aidd-tracked key remains in `.vscode/settings.json` or `.vscode/extensions.json`. |
| 1-2  | User-authored keys in those files are untouched. |
| 3    | The new tests fail if the delegation is reverted to the old `getToolFiles`-only deletion. |
| all  | `tsc --noEmit` clean, `pnpm test` green. |
