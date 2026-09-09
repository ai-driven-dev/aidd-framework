# `clean` drives the host's own CLI

`clean` never writes a host registry by hand and never deletes what aidd did not write. Read when touching `clean`, `clean --scope user` or a cache purge.

## Project scope, in order

1. Undo native registration through the host's CLI: `uninstallPlugin` per recorded ref, then `removeMarketplace` at its scope. Only Copilot declares a force-remove; Claude and Codex can refuse a marketplace still holding plugins.
2. Tracked files, merge files, plugin files.
3. `.aidd/` itself. A host needs `.aidd/cache/` alive during step 1.
4. Machine-local files no `plugins[].files` tracks: `.claude/settings.local.json`, a project-merged `.cursor/hooks.json` and its `.cursor/hooks/<plugin>/`, through `application/shared/remove-project-hooks.ts`.
5. A user-scope plugin directory (`~/.cursor/plugins/local/<plugin>`) only once `realpath` proves it strictly inside the tool's declared user-scope directory (`domain/plugins/user-scope-containment.ts`). A `..` segment or a post-install symlink is left and named.
6. Right after step 1, per tool driven: the cache root its profile declares (`NativeActivation.pluginCacheDir`), `<root>/<hostName>`, under the same containment.

- A binary off `PATH` is named and left alone.
- The shared `aidd-framework` registration is the one exception: `undoMarketplaceRegistration` refuses on the scope and warns, naming the host registration, the `marketplaces.json` entry and the tool's cache path.
- This project's refs are still uninstalled, except one a machine-global host (codex, copilot) enables while `references.json` names another project: left enabled and named.
- The warning names how many other projects still reference the source, or that `clean --scope user` purges it.
- A dry-run reports the same list without dropping anything.

## Cache purge

- Claude declares `marketplaceRegistry` too: full purge, gated on a fresh registry read no longer naming the host. Measured: claude marks an orphaned tree `.orphaned_at`, never deletes it.
- Codex declares `pluginCacheDir` alone: purged only once proven empty. Measured: its `plugin remove` leaves the empty shell.
- Copilot declares neither: never touched.

## `clean --scope user`

- The one command that purges the shared source.
- The user manifest is optional: a project-scope `setup` never writes one yet leaves the whitelist behind.
- Without it, steps 1–3 are skipped and said so; other projects in `references.json` are named with the order to run `aidd clean` in each first.
- Steps 1–2 run at scope `"user"` always, never guessed from the host default.
- Step 3: `purgeAllNativeCaches`, shared with project-scope `clean`.
- Step 4, always: a hardcoded whitelist under `userConfigDir()`: `cache/built/` in full, `cache/update-check.json`, root `update-check.json`, the `cache/` shell once a fresh `listDirectory` proves it empty, `references.json`; each re-resolved through `realpath` and `isStrictlyWithinUserScope` before deletion.
- `manifest.json` goes through its repository, the `aidd-framework` entry alone out of `marketplaces.json` through the registry; neither takes a path from the manifest.
- `userConfigDir()` itself is never a candidate.
- Confirmation, unless `--force`, names the source, every version under `cache/built/`, every live project in `references.json`, and the no-registration note.
- A project pointed at the purged source repairs itself on its next `aidd sync`.
