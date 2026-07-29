---
objective: Route marketplace add, list, refresh, and check through the shared ResolveMarketplaceUseCase, removing their hand-rolled cacheDir/fetch/load triplets.
status: implemented
---

## Context

`ResolveMarketplaceUseCase` (`src/application/use-cases/shared/resolve-marketplace-use-case.ts`) already encapsulates `marketplaceCacheDir` -> `fetchMarketplaceSource.execute` -> `catalogRepo.load`. Several plugin use-cases (`plugin-search-use-case.ts`, `plugin-pick-use-case.ts`, `plugin-install-from-marketplace-use-case.ts`, `setup-plugins-prompt-use-case.ts`) were already routed through it. The four marketplace commands (`add`, `list`, `refresh`, `check`) still hand-rolled the same triplet independently. This change routes all four through the shared use-case.

## What each of the four sites was

- `marketplace-add-use-case.ts`: built a throwaway `Marketplace` (hardcoded `scope: "project"`) inside a private `fetchSource` method just to satisfy the fetch signature, called `fetchMarketplaceSource.execute({ marketplace, cacheDir })` (no `fetchOptions`, so effectively `forceRefresh: false`), then called `catalogRepo.load(localPath)` separately, then built the *real* `Marketplace` (with the actual `scope`) afterward for persistence.
- `marketplace-list-use-case.ts`: `fetchOneCatalog` computed `cacheDir`, called `fetchMarketplaceSource.execute({ marketplace, cacheDir, fetchOptions: { forceRefresh: true } })`, then `catalogRepo.load(localPath)`, wrapped in try/catch reporting via `logger?.warn`.
- `marketplace-refresh-use-case.ts`: `refreshOne` computed `cacheDir` (also reused for `warnIfStale`'s disk check), called a private `fetchSource` helper (`fetchMarketplaceSource.execute` with `fetchOptions: { forceRefresh: true }`), then `catalogRepo.load(localPath)`, all wrapped in a try/catch that returns a `status: "failed"` result entry rather than throwing.
- `marketplace-check-use-case.ts`: `readCatalog` computed `cacheDir`, called `fetchMarketplaceSource.execute({ marketplace, cacheDir })` (no `fetchOptions`), then `catalogRepo.load(localPath)`, wrapped in try/catch that returns `{ known: null, error }` on throw and `{ known: null }` (no error) when the catalog is legitimately absent.

## Per-command differences and how each was preserved

| Command  | forceRefresh (final code)              | Error policy                                                                 | How preserved |
|----------|-----------------------------------------|-------------------------------------------------------------------------------|----------------|
| add      | omitted (defaults to `false`)          | Throws `InvalidPluginManifestError` when `catalog === null`; any resolve failure propagates as a thrown error | `resolveMarketplace.execute({ marketplace, projectRoot })` called with no `forceRefresh`; the `catalog === null` check and thrown error are unchanged, just fed from the destructured result instead of a separate `catalogRepo.load` call |
| list     | `true`                                   | report-and-continue: catch swallows the error, logs via `logger?.warn`, continues to the next marketplace | `fetchOneCatalog`'s try/catch now wraps `resolveMarketplace.execute(...)` instead of the fetch+load pair; same catch body, same log message |
| refresh  | `true`                                   | `// @policy report-and-continue`: catch returns `{ status: "failed", error }`, batch continues | `refreshOne`'s existing try/catch now wraps the single `resolveMarketplace.execute(...)` call; `warnIfStale`'s separate `cacheDir` computation (needed *before* the fetch, to detect a stale on-disk cache) is untouched since it is a pure path computation with no I/O |
| check    | omitted (defaults to `false`)           | `// @policy report-and-continue`: catch returns `{ known: null, error }`; a legitimately-missing catalog (no throw) returns `{ known: null }` with no error, so it is silently skipped from the `skipped` list | `readCatalog`'s try/catch now wraps `resolveMarketplace.execute(...)`; the `!catalog` branch and the catch branch are unchanged |

`ResolveMarketplaceUseCase.execute` always sends `fetchOptions: { forceRefresh: options.forceRefresh ?? false }` to the underlying fetch, never `undefined`. The `PluginFetcher` adapter already normalizes `options?.forceRefresh ?? false`, so `fetchOptions: undefined` and `fetchOptions: { forceRefresh: false }` are behaviourally identical (verified by reading `src/infrastructure/adapters/plugin-fetcher-adapter.ts:35`). This makes routing `add` and `check` (which never passed `fetchOptions` before) through `ResolveMarketplaceUseCase` a benign, checked-equivalent change, not a silent behaviour change.

`ResolveMarketplaceUseCase` itself was not modified.

## Decisions

| Decision | Why |
|----------|-----|
| Build `add`'s `Marketplace` once, before the resolve call, using the real `options.scope` | The old code built a throwaway marketplace with a hardcoded `scope: "project"` purely to satisfy the fetch call, then rebuilt the real one afterward for persistence. `FetchMarketplaceSourceUseCase.execute` only reads `marketplace.source` (for the fetch itself) and `marketplace.name` (for log lines), never `scope`, so building once with the real scope changes nothing observable and removes a pointless duplicate object. Confirmed no test asserts on `addedAt` ordering or the throwaway scope value. |
| Keep `add` and `check` passing no `forceRefresh` (letting it default to `false` inside `ResolveMarketplaceUseCase`) | The story requires it; also verified behaviourally identical to the previous `fetchOptions: undefined` via the adapter's `?? false` normalization. |
| Keep `list` and `refresh` passing `forceRefresh: true` | The story requires it; both commands are explicit "give me fresh data" operations (`list` builds a live catalog view, `refresh` is literally the refresh command). |
| Left `marketplaceCacheDir` import and its direct call in `refresh`'s `warnIfStale`/`isStaleCache` path untouched | That path needs the cache dir *before* the fetch happens (to detect whether the pre-existing on-disk cache is stale), independent of the resolve call. `marketplaceCacheDir` is a pure domain path function (no I/O), so computing it once for staleness-checking and once again inside `ResolveMarketplaceUseCase` is harmless duplication, not a violation of "one resolution path" — the I/O triplet (fetch + load) is what got deduplicated. |
| Did not touch `--force` / `MarketplaceCachePort.clear` in `refresh` | Explicitly out of scope per the story: `--force` clears the whole `cacheDir` via a different port; `forceRefresh` (a `PluginFetchOptions` field routed through `ResolveMarketplaceUseCase`) only deletes `cacheDir/<source-key>/`. Conflating them was flagged as a prior mistake; left `execute()`'s `if (options.force) await this.cache.clear(options.name)` line exactly as-is. |
| Did not modify `ResolveMarketplaceUseCase` | Explicitly forbidden by the story. Used it as-is, including for the mutation-test proof (temporarily forcing `catalog: null` inside it, then reverting — confirmed via `git diff` that the file returned to its original state). |
| Removed `catalogRepo` and `fetchMarketplaceSource` constructor params from all four use-cases | Grepped `this.catalogRepo` / `this.fetchMarketplaceSource` in each file after the edit; zero remaining references in any of the four classes. |
| Made `MarketplaceListUseCase`'s `resolveMarketplace` and `logger` constructor params stay optional | Preserves the existing "without withCatalogs" test construction (`new MarketplaceListUseCase(registry)`) and the pre-existing defensive early-return in `fetchOneCatalog` when the collaborator is not wired (now a single `if (this.resolveMarketplace === undefined) return;` guard instead of the old two-condition check). |
| All four command use-cases routed; none left on the old triplet | No command's error policy or forceRefresh requirement conflicted with what `ResolveMarketplaceUseCase` already provides, so there was no case requiring an exception. |

## Phase 1 — characterization tests

Added before any production code was touched, to pin down the failure/missing-catalog branches that a report-and-continue policy could silently turn into a throw:

- `marketplace-check-use-case.unit.test.ts`: added a test where the catalog is legitimately missing (no error, `skipped` stays empty) and a test where the fetch throws (`skipped` gets the entry with an error message).
- `marketplace-list-use-case.unit.test.ts`: added a test asserting `logger.warn` is actually called with the "Skipping marketplace" message on failure (previously only the silent no-logger path was tested), and a test pinning the guard-return behaviour when the fetch collaborator is not wired.
- `marketplace-add-use-case.unit.test.ts`: added a test for the `InvalidPluginManifestError` thrown when `marketplace.json` is missing at the source — this path existed in production code but had zero test coverage before this task, and it is exactly the kind of missing-catalog path called out by the story as the highest risk for silently changing from throw to skip.

Coverage measured via:
```
npx vitest run --project=unit --project=integration --coverage \
  --coverage.include='src/application/use-cases/marketplace/marketplace-check-use-case.ts' \
  --coverage.include='src/application/use-cases/marketplace/marketplace-list-use-case.ts' \
  --coverage.reporter=json-summary --coverage.reportsDirectory=/tmp/cov-mkt
```

| Stage | check-use-case branches | check-use-case lines/statements | list-use-case branches | list-use-case lines/statements |
|-------|------------------------|----------------------------------|--------------------------|-----------------------------------|
| Baseline (before any change) | 71.42% (10/14) | 92.64% | 77.77% (7/9) | 100% |
| After Phase 1 tests, before production refactor | 89.47% (17/19) | 100% | 100% (12/12) | 100% |
| Final, after production refactor | 89.47% (17/19) | 100% | 100% (11/11) | 100% |

The branch denominator for `list` drops from 12 to 11 between "after Phase 1" and "final" because the refactor collapsed the old two-condition guard (`this.fetchMarketplaceSource === undefined || this.catalogRepo === undefined`) into a single-condition guard (`this.resolveMarketplace === undefined`) — one fewer branch exists in the source, not one fewer covered. `check`'s remaining 2 uncovered branches (17/19, unchanged across stages) are pre-existing, unrelated to the routed paths: a `staleMaxDays` default (`??`) and an `err instanceof Error` ternary fallback that only fires for non-`Error` throwables, neither of which this task's stated coverage gaps (lines 72, 90, 92, 105 / statements 73-75, 93, 94) referenced. All of those explicitly named lines are covered in the final state.

## Verification

1. `npx tsc --noEmit` — no errors, both before committing to the refactor's final state.
2. `pnpm test` (from `cli/`) — 196 test files, 2118 tests passed. Baseline was 2113; Phase 1 added 5 characterization tests (2 in check, 2 in list, 1 in add), for 2113 + 5 = 2118. No existing assertion was modified; existing test files were only touched for constructor/wiring changes plus the new characterization tests.
3. Biome, one file at a time via `./node_modules/.bin/biome check --write <file>` (binary invoked directly, not via `npx`): all 10 changed files (`marketplace-add-use-case.ts`, `marketplace-list-use-case.ts`, `marketplace-refresh-use-case.ts`, `marketplace-check-use-case.ts`, `deps.ts`, and the 5 corresponding/adjacent test files) each reported "No fixes applied."
4. Mutation test: temporarily changed `ResolveMarketplaceUseCase.execute` to always return `catalog: null` regardless of what `catalogRepo.load` returned. Ran `pnpm test`. Result: 40 tests across 13 test files failed, spanning all four routed commands plus the already-routed plugin commands and several e2e suites:
   - `tests/application/use-cases/marketplace/marketplace-add-use-case.unit.test.ts` (add)
   - `tests/application/use-cases/marketplace/marketplace-check-use-case.unit.test.ts` (check)
   - `tests/application/use-cases/marketplace/marketplace-list-use-case.unit.test.ts` (list)
   - `tests/application/use-cases/marketplace/marketplace-refresh-use-case.unit.test.ts` (refresh)
   - `tests/application/use-cases/shared/resolve-marketplace-use-case.unit.test.ts` (the shared use-case's own tests, expected)
   - `tests/application/use-cases/plugin/plugin-install-from-marketplace-use-case.unit.test.ts`, `plugin-pick-use-case.unit.test.ts`, `plugin-search-use-case.unit.test.ts` (plugin commands already routed prior to this task, confirming the shared dependency is real, not new)
   - `tests/e2e/plugin-install.e2e.test.ts`, `command-matrix-plugin.e2e.test.ts`, `framework-build.e2e.test.ts`, `issue-271-setup-cache-version.e2e.test.ts`, `persona.e2e.test.ts` (end-to-end coverage of `marketplace add`, `marketplace list`, `marketplace remove`, `marketplace refresh`, `plugin install`, `plugin search`)
   Reverted the mutation; `git diff` on `resolve-marketplace-use-case.ts` showed no residual changes (file identical to its pre-mutation state). Re-ran `pnpm test`: 196 files / 2118 tests passed again.
5. Read the final source of all four use-cases: `add` and `check` call `resolveMarketplace.execute(...)` with no `forceRefresh` field (defaults to `false` inside `ResolveMarketplaceUseCase`); `list` and `refresh` both pass `forceRefresh: true`. Confirmed as a checked fact, not carried over from the story's framing.

## Dead constructor params removed

- `MarketplaceAddUseCase`: removed `catalogRepo` (`PluginCatalogRepository`) and `fetchMarketplaceSource` (`FetchMarketplaceSourceUseCase`); added `resolveMarketplace` (`ResolveMarketplaceUseCase`).
- `MarketplaceListUseCase`: removed `catalogRepo` and `fetchMarketplaceSource`; replaced with a single optional `resolveMarketplace` param (kept optional to preserve existing "without withCatalogs" test construction and the defensive early-return behaviour).
- `MarketplaceRefreshUseCase`: removed `catalogRepo` and `fetchMarketplaceSource`; added `resolveMarketplace`. `fs` and `logger` were kept — both are still used directly by `warnIfStale`/`isStaleCache`, unrelated to the resolve routing.
- `MarketplaceCheckUseCase`: removed `catalogRepo` and `fetchMarketplaceSource`; added `resolveMarketplace`.
- Construction sites updated: `src/infrastructure/deps.ts` (hoisted `resolveMarketplaceUseCase` above the four marketplace use-cases so it can be passed in; updated all four constructor calls), and every test file constructing these four classes: `marketplace-add-use-case.unit.test.ts`, `marketplace-list-use-case.unit.test.ts`, `marketplace-refresh-use-case.unit.test.ts`, `marketplace-refresh-progress.unit.test.ts`, `marketplace-check-use-case.unit.test.ts`.
