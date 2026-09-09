# The framework source is machine-scope

One registration of `aidd-framework` per machine, shared by every project. Read when touching `setup`, `sync`, `doctor`, `clean` or `references.json`.

## Why

- A project-scope source made claude, codex and copilot disagree on a second project.
- Measured: codex and copilot refuse a second source under the same name; claude silently repoints the whole machine.
- So the source left `<projectRoot>/.aidd/`.

## Where

- Registration: `userConfigDir()/marketplaces.json`, `scope: "user"`.
- Build: `userConfigDir()/cache/built/<version>/aidd-framework/<tool>` (`kernel/paths.ts`, `userBuiltMarketplaceDir`).
- Built once per CLI version.

## Migration

- `MarketplaceRegisterFrameworkUseCase` retires a project-scope entry to the shared one on every `setup` or `sync`.
- Unconditional, not behind `--force`: `MarketplaceRegistryAdapter.list()` answers project-scope entries first, so a leftover would win forever.
- The migration carries the entry's own recorded source, never the local-path default.
- It also repoints a host still tracking *another* project's pre-migration cache, without breaking that project, and records both claims.
- Codex and copilot have no readable marketplace registry; on a refusal at the reserved name and scope they reclaim it, `remove` then `add`. Never for an arbitrary marketplace.
- This project's stale `.aidd/cache/built/aidd-framework/` is deleted only once the run reports no error, no missing binary, no failed build. A host needs that tree to resolve what it unregisters.

## `references.json`

- `userConfigDir()/references.json`: `{ "<version>": ["<projectRoot>", …] }` (`contexts/framework/domain/ports/user-source-references.ts`).
- Written by `setup` and `sync` whenever the framework marketplace resolves to scope `"user"`.
- `clean` drops only this project's claim, once, never the registration.
- A help, not an authority: a `projectRoot` deleted with `rm -rf` is ignored at read.
- At zero claims, `clean` names `clean --scope user` as the purge.
- `aidd marketplace remove aidd-framework` refuses the same way; it carries no `--scope user` flag.

## `doctor`

- Reads the registered path's version segment structurally, never a catalog.
- Warns, never errors, when a host follows a newer aidd (names `aidd update`).
- Warns when a host still points at a per-project cache (names `aidd sync`).
- Whether the registry itself records project scope or only the host lags.

## `sync`'s write path

- Refuses to write to a host already ahead.
- Brings a host behind forward as an ordinary update.
- Same version: no-op.

## `setup --scope user`

- Registers the shared source and drives native activation machine-wide.
- Writes nothing under `projectRoot`: no content, no plugin prompt, no gitignore touch.
- Its manifest: `userManifestPath(userConfigDir())`, `userConfigDir()/manifest.json`, same schema and version as the project one.
- `UserManifestRepositoryAdapter` reuses `Manifest.fromJSON`/`toJSON`; its `delete()` removes that one file only.
- Each AI tool gets a manifest entry with an empty file list, so `MarketplaceSyncSettingsUseCase` has something to iterate.
- Records no `references.json` claim: absence is the state until `clean --scope user`.
- `doctor --scope user` runs only `DoctorRegistrationUseCase`.
- `sync --scope user` resolves the same manifest.
- `--scope <project|user>` on all three, default `project`.
- Refuses an `--ide` tool (`UserScopeIdeToolsError`): IDE config is project-relative.
- Refuses an AI tool without machine-wide activation (`UserScopeUnsupportedAiToolsError`; `registry.ts`'s `supportsUserScopeActivation`, false for opencode alone).
- Both refusals fire in `SetupFlow`'s constructor; `--ai all` is unusable at this scope.
