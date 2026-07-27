---
objective: "marketplace refresh --force clears the cache through its use-case, so the command layer holds no refresh logic of its own."
status: implemented
---

# Plan: SPIKE-E5-07 + BUG-E5-08 — refresh --force goes through the use-case

## Overview

| Field      | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| **Goal**   | Move the `--force` cache clear out of `marketplace.ts` and into `MarketplaceRefreshUseCase`. |
| **Source** | `epic-E5-command-layer-safety.md` (SPIKE-E5-07, BUG-E5-08 — cartography item A14) |

## Phases

| #   | Phase                            | File                          |
| --- | ---------------------------------- | ------------------------------ |
| 1   | Move the cache clear into the use-case | [`phase-1.md`](./phase-1.md) |

## Spike findings (SPIKE-E5-07) — confirmed

`marketplace.ts:143-145`:

```ts
if (cmdOptions.force) {
  await deps.marketplaceCache.clear(name);
}
const { results, failedCount } = await deps.marketplaceRefreshUseCase.execute({ projectRoot, name });
```

The command reaches straight into a port (`MarketplaceCachePort`) and performs a step of the refresh operation itself, instead of expressing it as an option on the use-case. That contradicts the project's layering rule — commands are wiring, orchestration belongs to use-cases — and it means the `--force` semantics are invisible to anyone reading `MarketplaceRefreshUseCase`.

**Two consequences beyond style:**
1. `--force` is untestable at the use-case level. Every existing refresh test constructs the use-case directly, so none of them can exercise the flag; it is only reachable through the CLI.
2. Order matters and is currently implicit: the clear must happen *before* the fetch loop. Nothing in the use-case enforces or documents that.

Related, not a defect: `fetchSource()` already passes `forceRefresh: true` unconditionally, so `--force` is specifically about **removing the cached directory first**, not about re-fetching. The two are different operations and the flag name only reads correctly once the clear lives beside the fetch.

`deps.marketplaceCache` has exactly one consumer in `src/` — this command.

## Decisions

| Decision | Why |
| -------- | --- |
| Add `MarketplaceCachePort` as a **required** constructor dependency, not an optional one | The use-case's existing optionals (`logger?`, `fs?`) are genuine degradations — refresh still works without them. The cache is not: with `force: true` and no cache, the option would silently do nothing, which is the class of bug this epic keeps finding. Required means `tsc` enumerates the 4 construction sites instead of letting one slip through as `undefined`. |
| Drop `marketplaceCache` from the exported `Deps` interface | Once the command stops calling it, its only consumer is `deps.ts` itself, wiring it into the use-case. Leaving it on the public surface would invite the next command to reach past the use-case the same way. It stays constructed internally. |
