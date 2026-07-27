---
status: done
---

# Instruction: Move the --force cache clear into the use-case

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/
    │   ├── application/use-cases/marketplace/
    │   │   └── marketplace-refresh-use-case.ts        ✏️ modify (force option + cache dep)
    │   ├── application/commands/marketplace.ts         ✏️ modify (pass the flag, drop the port call)
    │   └── infrastructure/deps.ts                      ✏️ modify (inject cache, drop it from Deps)
    └── tests/application/use-cases/marketplace/
        ├── marketplace-refresh-use-case.unit.test.ts   ✏️ modify (new ctor arg + force coverage)
        └── marketplace-refresh-progress.unit.test.ts   ✏️ modify (new ctor arg)
```

## Tasks to do

### `1)` Teach the use-case about `force`

1. Add `force?: boolean` to `MarketplaceRefreshOptions`, documented as "clear the cached copy before re-fetching".
2. Add `private readonly cache: MarketplaceCachePort` to the constructor, positioned **before** the existing `logger?`/`fs?` optionals.
3. At the top of `execute()`, before the target loop: `if (options.force) await this.cache.clear(options.name);` — ordering now enforced by the use-case rather than by the caller.

### `2)` Make the command a pass-through

1. Delete the `if (cmdOptions.force) { await deps.marketplaceCache.clear(name); }` block.
2. Pass `force: cmdOptions.force` into `marketplaceRefreshUseCase.execute({ projectRoot, name, force })`.

### `3)` Rewire deps

1. Pass `marketplaceCache` into `new MarketplaceRefreshUseCase(...)` at its new position.
2. Remove `marketplaceCache` from the `Deps` interface and from the returned object — internal wiring only now.

### `4)` Update and extend the tests

1. Add the new constructor argument at the 4 test sites (`tsc` lists them).
2. Add coverage for the flag itself, which was previously unreachable from the use-case:
   - `force: true` → `cache.clear` called once with the requested name, **before** any fetch
   - `force: false`/absent → `cache.clear` never called
   - `force: true` with no `name` → `clear(undefined)`, i.e. all marketplaces

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| 1-3  | `aidd marketplace refresh --force` still clears before re-fetching; without the flag the cache is left alone. Same observable behaviour as before. |
| 2    | `grep -n "marketplaceCache" src/application/commands/marketplace.ts` returns nothing. |
| 3    | `grep -rn "deps.marketplaceCache" src/` returns nothing — the port is no longer on the public `Deps` surface. |
| 4    | The force-path tests fail if the `clear` call is removed from the use-case. |
| all  | `tsc --noEmit` clean, `pnpm test` green. |
