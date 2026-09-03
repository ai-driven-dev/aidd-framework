---
objective: "buildClaudeStyleMarketplaceEntry and PluginTranslator each name exactly one symbol in src/, so a grep or IDE jump-to-definition is never ambiguous."
status: implemented
---

# Plan: SPIKE-E6-01 + BUG-E6-02 — resolve the 2 name collisions

## Overview

| Field      | Value                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| **Goal**   | Rename one side of each of the 2 confirmed name collisions; zero behavior change. |
| **Source** | `aidd_docs/tasks/2026_07/2026_07_22_aidd-tool-contract-cartography/epic-E6-naming-di-hygiene.md` (SPIKE-E6-01, BUG-E6-02) |

## Phases

| #   | Phase                          | File                          |
| --- | -------------------------------- | ------------------------------ |
| 1   | Rename both collisions           | [`phase-1.md`](./phase-1.md) |

## Spike findings (SPIKE-E6-01)

**Collision 1 — `buildClaudeStyleMarketplaceEntry`, confirmed genuinely different functions:**
- `src/domain/capabilities/marketplace-entry.ts:8` — `(input: MarketplaceSettingsInput) => MarketplaceSettingsEntry | null`. Builds a tool's own `settings.json` marketplace registration entry at install time. Imported by `domain/tools/ai/claude.ts:3` and `domain/tools/ai/copilot.ts:3` as each tool's `toEntry` capability callback.
- `src/application/use-cases/framework/strategies/marketplace-strategy-helpers.ts:169` — `(name, description, version, srcEntry) => Record<string, unknown>`. Builds one plugin's row in the BUILT `marketplace.json` catalog file, at `framework build` time. Used only within the same file, consumed by `tool-contracts.ts:65,109`.
- Never imported into the same file — no compile collision today, but identical names for unrelated concepts.

**Collision 2 — `PluginTranslator`, confirmed genuinely different roles:**
- `src/domain/models/plugin-translator.ts` — a **class**. Converts one plugin distribution's raw file content into a specific tool's installed format (markdown frontmatter, flat namespacing, hooks conversion). Value-imported (constructed via `new`) by `plugin-add-use-case.ts`, `plugin-update-use-case.ts`, `apply-plugin-files-use-case.ts`, plus 2 unit tests.
- `src/application/use-cases/plugin/translator/plugin-translator.ts` — an **interface**. The strategy contract implemented by `BuiltTreeMaterializationTranslator`/`ModeAMarketplaceTranslator`/`ModeBFlatMaterializationTranslator`, resolved by `plugin-translator-factory.ts`. This is the protected Section-C strategy pattern — not touched by this fix, only disambiguated from the unrelated class.
- **Direct evidence of real friction**: `mode-b-flat-materialization-translator.ts` already imports both under the same original name and had to locally alias the domain one to `PluginTranslatorHelper` just to compile. This ticket removes the need for that workaround.

## Decisions

| Decision | Why |
| -------- | --- |
| Rename `marketplace-strategy-helpers.ts`'s function to `buildClaudeStyleCatalogEntry`, leave the domain one alone | It's the narrower-blast-radius side (2 call sites, both same-file) and pairs naturally with the neighboring `buildClaudeStyleMarketplace` (catalog root) already in that file — reads as "build one catalog entry for the marketplace this file builds." |
| Rename `domain/models/plugin-translator.ts`'s class to `PluginContentTranslator`, plus the file to `plugin-content-translator.ts` — leave the application-layer interface alone | The interface is the protected strategy-pattern contract (Section C, do-not-touch) with 4 implementer/factory sites; the domain class is a narrower content-format converter with 3 production call sites + tests. Renaming the file alongside the class matches this codebase's dominant convention (class name = file name) and removes `mode-b-flat-materialization-translator.ts`'s now-unnecessary import alias. |
