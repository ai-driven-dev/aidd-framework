---
objective: "The implicit build-cache-rebuild force:true is documented in code as an intentional decision and pinned by a regression test, per BUG-E2-01's DoD."
status: implemented
---

# Plan: BUG-E2-01 — document the implicit cache-rebuild force

## Overview

| Field      | Value                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Make `deps.ts`'s hardcoded `force: true` for the internal build-cache rebuild an explicit, tested decision instead of an unexplained magic value. |
| **Source** | `aidd_docs/tasks/2026_07/2026_07_22_aidd-tool-contract-cartography/epic-E2-install-build-integrity.md` (BUG-E2-01) |

## Phases

| #   | Phase                              | File                          |
| --- | ----------------------------------- | ------------------------------ |
| 1   | Document + pin the intentional force | [`phase-1.md`](./phase-1.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| DoD option (b) — document the silent-force as intentional, do not propagate a real `--force` flag from `install`/`update` into it | Traced `outDir` for this closure (`ensure-built-marketplace-use-case.ts` → `builtMarketplaceDir()` → `paths.ts`): it is always `.aidd/cache/built/<marketplace>/<target>`, an aidd-owned disposable build cache, never the user's live tool config. No data-loss risk exists at this path, so there is nothing correct to propagate — `ai install --force`/`ide install --force` mean "overwrite the live tool install," a different concept, and would be a semantically wrong fit here. The direct `aidd framework build --flat --force` CLI command already threads the real user force correctly (`framework.ts:57,64`) and is unaffected. |
