# A marketplace's identity is its declared name plus its plugin set

Read when touching `registerMarketplace`, `checkMarketplaceSources` or `nativeRegistrations.marketplaces`.

## Alias and host name

- A project's local alias may differ from what the catalog declares.
- Claude registers by the catalog's own name only.
- `nativeRegistrations.marketplaces` records both: `alias` (aidd's key), `hostName` (the catalog's name).
- Every host-facing call addresses `hostName`: the guard, `checkMarketplaceSources`, `clean`'s remove, `plugin remove`'s uninstall and cache purge.

## What claude would accept

- `claude plugin marketplace add` derives the name from the source's `marketplace.json`.
- A known name is silently repointed: no prompt, no error, exit 0, regardless of `--scope`.
- aidd refuses instead.

## The check

- `MarketplaceSyncSettingsUseCase.registerMarketplace` reads `known_marketplaces.json` first (`contexts/tools/domain/ports/host-marketplace-registry-reader.ts`, through `realpath`).
- Refuses only a `hostName` registered under a *different catalog* (`contexts/tools/domain/marketplace-source-conflict.ts`).
- Identity: declared name plus plugin set, from each side's `marketplace.json`. Never a path, never the version.
- A version bump under the same name and plugins is the host repointing to a newer build: no conflict.
- The same catalog from a differently resolved path: no conflict. Two projects auto-registering `aidd-framework` from their own builds measure exactly that; `pnpm smoke`'s shared-`$HOME` pattern surfaces it.
- A registered source whose catalog cannot be read: a dead entry a re-add repairs.
- `doctor` carries the same read as `checkMarketplaceSources`, `error`-severity, apart from the four registration states.
- The refusal is counted in `SyncFailedError`, printed the same way by `sync`, `plugin install | remove | update`, `marketplace add | remove | refresh`: all seven exit non-zero where they once passed silently or printed a false `registered.`/`removed.`.
