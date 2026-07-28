---
objective: Route PluginSearchUseCase and PluginPickUseCase through ResolveMarketplaceUseCase so all three catalog consumers resolve marketplaces one way, without touching per-caller name-matching behaviour.
status: implemented
---

## Premise check: the matching-unification claim is false

Story US-E7-04 (item B8) claimed that `PluginSearchUseCase`, `PluginPickUseCase`, and
`PluginInstallFromMarketplaceUseCase` contain three implementations of "find a plugin by
name in a catalog" that should be unified. Reading the three use-cases shows this is not
the case: they do three different things on purpose, and none of them is a variant of the
other two.

- `plugin-search-use-case.ts:54`, fuzzy discovery:
  `entry.name.toLowerCase().includes(q) || desc.includes(q)`.
  Substring, case-insensitive, matches on name OR description.
- `plugin-install-from-marketplace-use-case.ts:117`, exact identifier resolution:
  `entry.name === options.pluginName`.
  Exact, case-sensitive, name only.
- `plugin-pick-use-case.ts`: no name matching at all. `execute()` loads the catalog and
  hands `catalog.plugins` wholesale to `chooseEntries`, which builds an interactive
  checkbox prompt; the user picks entries directly. There is no string comparison to unify.

Unifying these would change behaviour, not remove duplication, and the change would be
harmful in the install case specifically: if `aidd plugin install foo` used fuzzy
matching, it could resolve to `foo-bar` and silently install the wrong plugin. Making
search exact would break discovery (the whole point of `aidd plugin search`). This part
of the story is not implemented; the matching logic in all three files is untouched.

## What was actually duplicated, and what was done

The real duplication was catalog *resolution*, not matching. Three call sites hand-rolled
the same triplet (`marketplaceCacheDir()`, then `fetchMarketplaceSource.execute()`, then
`catalogRepo.load()`), and `PluginInstallFromMarketplaceUseCase` already used
`ResolveMarketplaceUseCase` (`src/application/use-cases/shared/resolve-marketplace-use-case.ts`)
to encapsulate it. `PluginSearchUseCase` and `PluginPickUseCase` did not.

Both were routed through `ResolveMarketplaceUseCase`:

- `PluginSearchUseCase.searchOne` now calls
  `this.resolveMarketplace.execute({ marketplace: m, projectRoot: options.projectRoot })`
  and keeps `if (!catalog) return []`. This is the same skip-on-null behaviour
  `PluginInstallFromMarketplaceUseCase.matchesIn` already has at line 115, and
  `ResolveMarketplaceUseCase` returns `catalog: null` (never throws) on a missing or
  malformed marketplace, so the observable behaviour is identical to before.
- `PluginPickUseCase.loadCatalog` now calls `this.resolveMarketplace.execute({ marketplace, projectRoot })`
  and destructures both `catalog` and `localPath` from the result, keeping its
  `if (catalog === null) throw new InvalidPluginManifestError(...)` branch. The error
  message embeds `localPath` exactly as before, now sourced from the resolver's return
  value instead of being recomputed locally. `ResolveMarketplaceUseCase.execute` computes
  `localPath` the same way the old call site did (`marketplaceCacheDir(projectRoot, marketplace.name)`
  as input to the same `fetchMarketplaceSource.execute`), so the value is identical by
  construction; a characterization test now asserts the full error message including the
  path, not just the error class, so any future drift in that provenance would be caught.

Routing was safe with respect to fetch options too. Neither caller previously passed
`fetchOptions` to `fetchMarketplaceSource.execute` (it was `undefined`).
`ResolveMarketplaceUseCase` always passes `fetchOptions: { forceRefresh: options.forceRefresh ?? false }`,
which becomes `{ forceRefresh: false }` when the caller omits `forceRefresh` (as both do).
The only real `PluginFetcher` implementation, `plugin-fetcher-adapter.ts:35`, reads
`options?.forceRefresh ?? false`, so `undefined` and `{ forceRefresh: false }` are
indistinguishable at the only place that consumes the option. No behaviour changes here.

`MarketplaceCheckUseCase` also hand-rolls the same triplet and was left alone. It is
outside the scope named in this task (that is a separate item, B9, for marketplace
commands), and touching it was not required to remove the duplication between the three
plugin use-cases named in the story.

## Error-behaviour difference preserved

`ResolveMarketplaceUseCase` never throws on a missing catalog; it returns
`{ catalog: null }`. The three callers react differently to that:

- `PluginInstallFromMarketplaceUseCase.matchesIn`: returns `[]` (skip this marketplace).
- `PluginSearchUseCase.searchOne`: returns `[]` (skip this marketplace), unchanged.
- `PluginPickUseCase.loadCatalog`: throws `InvalidPluginManifestError`, unchanged.

`ResolveMarketplaceUseCase` itself was not modified. Each caller's null-handling was
preserved at the call site, per the task's explicit instruction not to let a throw become
a skip or vice versa.

## Dead constructor parameters removed

Before routing, `PluginSearchUseCase` took `(catalogRepo, registry, fetchMarketplaceSource)`
and `PluginPickUseCase` took `(catalogRepo, registry, fetchMarketplaceSource, pluginAddUseCase, prompter)`.
After routing, neither class references `catalogRepo` or `fetchMarketplaceSource` anywhere
(verified with `grep -n "catalogRepo\|fetchMarketplaceSource"` on both files, zero
matches), so both parameters were removed:

- `PluginSearchUseCase(registry, resolveMarketplace)`
- `PluginPickUseCase(registry, resolveMarketplace, pluginAddUseCase, prompter)`

Construction sites updated:
- `src/infrastructure/deps.ts`: both use-cases now receive the already-constructed
  `resolveMarketplaceUseCase` (built earlier in the file, at the point the marketplace
  check use-case is wired, well before either plugin use-case is constructed, so no
  reordering was needed).
- `tests/application/use-cases/plugin/plugin-search-use-case.unit.test.ts`: `buildUseCase`
  now builds a `ResolveMarketplaceUseCase` from the existing `FetchMarketplaceSourceUseCase`
  and `PluginCatalogRepositoryAdapter` and passes that instead.
- `tests/application/use-cases/plugin/plugin-pick-use-case.unit.test.ts`: same pattern.

One more reference was checked and left alone:
`tests/application/use-cases/plugin/plugin-install-use-case.unit.test.ts` imports
`PluginPickUseCase` only as a TypeScript type for a hand-built mock object
(`{ execute: pickExecute } as unknown as PluginPickUseCase`); it does not call the real
constructor, so the parameter removal does not affect it.

`pluginCatalogRepository` and `fetchMarketplaceSource` remain in `deps.ts` because other
use-cases (`MarketplaceCheckUseCase`, `MarketplaceSyncSettingsUseCase`,
`ResolveMarketplaceUseCase` itself, and others) still depend on them directly.

## Decisions

| Decision | Why |
|---|---|
| Leave name-matching logic untouched in all three files | The premise that they duplicate matching logic is false; unifying would change observable behaviour (fuzzy install, or exact-only search) rather than remove duplication. |
| Route search and pick through `ResolveMarketplaceUseCase`, do not modify it | The triplet (cache dir, then fetch, then load) really was duplicated three ways; `ResolveMarketplaceUseCase` already existed and already encapsulated it correctly for the install caller. |
| Adapt at the call site instead of changing `ResolveMarketplaceUseCase`'s null handling | `ResolveMarketplaceUseCase` returns `catalog: null` uniformly; pick needs a thrown `InvalidPluginManifestError`, search needs a silent skip. Changing the shared use-case to throw would break search (and install); changing it to never throw would already match, so the adaptation is entirely on the pick side, in `loadCatalog`. |
| Leave `MarketplaceCheckUseCase` alone | It hand-rolls the same triplet but is not one of the three use-cases named in the story; that consolidation is item B9's scope over marketplace commands, not this task. |
| Write characterization tests for `plugin-pick-use-case.ts` before routing | Its branch coverage was 66.66% (10/15) with the untested paths including the exact `catalog === null` error branch this change touches. Pinning behaviour first means the routing change can be verified not to alter it. |
| Assert the full error message (path included), not just the error class, on the missing-catalog test | The routing change moved where `localPath` comes from (previously recomputed locally, now read off the resolver's result). The message is the only observable that depends on that value, so it is the thing worth pinning. |
| Don't chase the last uncovered branch (`entry.strict ?? false`, right-hand side) | `PluginCatalogEntry.strict` is typed `boolean` (not `boolean \| undefined`), and `parsePluginCatalog` (`plugin-catalog.ts:40`) always resolves it to a definite boolean before entries reach this use-case. The `?? false` fallback is unreachable dead code, corroborated by `plugin-install-from-marketplace-use-case.ts` passing `chosen.entry.strict` with no coalesce anywhere else in the codebase. Not touched, outside the scope of this task. |

## Verification

1. `npx tsc --noEmit`: no errors.
2. `pnpm test` (from `cli/`):
   - Baseline before any change: 2109 passed (196 test files).
   - After adding 4 characterization tests to `plugin-pick-use-case.unit.test.ts`
     (Phase 1, before touching production code): 2113 passed.
   - After routing `PluginSearchUseCase` and `PluginPickUseCase` through
     `ResolveMarketplaceUseCase` and updating `deps.ts` and the two unit-test
     construction sites: 2113 passed, 196 test files, no existing assertion modified.
3. Biome, one file at a time via `./node_modules/.bin/biome check --write <file>`:
   - `src/application/use-cases/plugin/plugin-search-use-case.ts`: "No fixes applied."
   - `src/application/use-cases/plugin/plugin-pick-use-case.ts`: "No fixes applied."
   - `src/infrastructure/deps.ts`: first run reformatted the new `PluginSearchUseCase(...)`
     call onto multiple lines ("Fixed 1 file"); second run: "No fixes applied."
   - `tests/application/use-cases/plugin/plugin-search-use-case.unit.test.ts`: "No fixes applied."
   - `tests/application/use-cases/plugin/plugin-pick-use-case.unit.test.ts`: first run
     reformatted a long assertion line ("Fixed 1 file"); second run: "No fixes applied."
4. Coverage of `src/application/use-cases/plugin/plugin-pick-use-case.ts`
   (`npx vitest run --project=unit --project=integration --coverage --coverage.include=... --coverage.reporter=json-summary`):
   - Before characterization tests: lines/statements 67/73 (91.78%), branches 10/15 (66.66%).
   - After characterization tests, before routing: lines/statements 73/73 (100%), branches 22/23 (95.65%).
   - After routing (no regression from the production change): lines/statements 73/73 (100%), branches 22/23 (95.65%).
   - The branch denominator moved from 15 to 23 between the "before" and "after" runs. This
     is a known artifact of V8's lazy bytecode compilation: code paths that were never
     compiled in a given run are not counted in that run's branch total. It is not a change
     in the source file. The one branch that remains uncovered (`entry.strict ?? false`,
     the `false` fallback) is dead code, as noted above.
   - 4 characterization tests were added, covering: choosing among multiple registered
     marketplaces, the `catalog === null` to `InvalidPluginManifestError` path (with the
     path embedded in the message asserted), an empty catalog skipping the checkbox
     prompt, and an entry carrying a description and an explicit `strict` flag.
5. Mutation test: `ResolveMarketplaceUseCase.execute` was changed to always return
   `catalog: null` regardless of what `catalogRepo.load()` returned, then the full suite
   was run, then the change was reverted.
   - Failing test files (26 tests across 8 files, all reachable only through
     `ResolveMarketplaceUseCase`'s `catalog: null` path):
     - `tests/application/use-cases/plugin/plugin-search-use-case.unit.test.ts`: all 3 tests (caller: `PluginSearchUseCase`)
     - `tests/application/use-cases/plugin/plugin-pick-use-case.unit.test.ts`: 4 of 7 tests (caller: `PluginPickUseCase`)
     - `tests/application/use-cases/plugin/plugin-install-from-marketplace-use-case.unit.test.ts`: all 10 tests (caller: `PluginInstallFromMarketplaceUseCase`, already routed before this task)
     - `tests/application/use-cases/shared/resolve-marketplace-use-case.unit.test.ts`: 1 test (the shared use-case's own unit test)
     - `tests/e2e/framework-build.e2e.test.ts`, `tests/e2e/issue-271-setup-cache-version.e2e.test.ts`, `tests/e2e/persona.e2e.test.ts`, `tests/e2e/plugin-install.e2e.test.ts`: 8 tests total, exercising the same paths end to end
   - This confirms all three named callers now share one resolution path: breaking
     `ResolveMarketplaceUseCase` in a way that is not coincidentally correct for any of
     them fails tests for all three, not just one.
   - After reverting the mutation: `npx tsc --noEmit` clean, `pnpm test` back to 2113
     passed, 196 test files.
