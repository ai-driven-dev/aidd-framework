# Architecture

## Stack

- TypeScript ESM, Node.js >= 22.12, bundled via tsup → `dist/cli.js`
- Runtime dependencies (6 allowed; each requires explicit justification; new additions require an ADR):
  - `commander` — CLI argument/command parsing
  - `@inquirer/prompts` — interactive terminal prompts
  - `ajv` — JSON-schema validation for marketplace/plugin schemas
  - `ajv-formats` — standard format validators (uri, date, etc.) for ajv
  - `simple-git` — git clone/fetch for plugin distribution
  - `smol-toml` — TOML read/write for Codex config round-trips
- Vitest (tests), Biome (lint/format), Lefthook (git hooks via parent monorepo)

## Structure

The codebase is organised by bounded context, not by hexagonal layer — see
`aidd_docs/memory/codebase-map.md` for the tree, and `.claude/rules/00-architecture/0-contexts.md`
for the three invariants that govern it (the allowed edges between contexts, the kernel's
no-context/no-logic rule, and the no-reach-into-a-context's-interior rule). Both are enforced by
`tests/architecture/` rather than described here, so this file does not restate the tree: a second
copy of it would drift the moment either changed without the other.

## Key Domain Concepts

- `AiTool<C>` — generic AI tool type; `C` = intersection of `Has*` capability interfaces
- `IdeToolConfig` — IDE tool type (vscode); no capabilities
- `ToolConfig = AiTool<unknown> | IdeToolConfig` — discriminated union; `isAiTool()` is the guard
- `Manifest` — aggregate root, tracks every installed file with MD5 hash (`.aidd/manifest.json`)
- Framework layout is code-defined — no `framework.json` on disk

## Domain Models (notable)

| Model | File | Description |
|---|---|---|
| `MarketplaceSourceMode` | `contexts/distribution/domain/marketplace-source-mode.ts` | Marketplace source type with optional `ref` |
| `SetupFlow` | `contexts/framework/domain/setup-flow.ts` | Aggregate: setup orchestration state |
| `MarketplaceEntry` | `contexts/tools/domain/marketplace-entry.ts` | Per-tool marketplace registration entry |
| `MarketplaceCacheEntry` | `contexts/distribution/domain/marketplace-cache-entry.ts` | Cached catalog TTL entry |
| `LatestReleaseResolver` | `runtime/self-update/latest-release-resolver.ts` | Port: resolve latest GitHub release tag |

## Install Flows (high-level)

**Tool runtime config** (`aidd framework install --tool <tool>`):
```
InstallRuntimeConfigUseCase | InstallIdeConfigUseCase → AssetLoader (bundled in binary) → FileSystem + ManifestRepository
```

**Plugin** (`aidd plugin install <name>`):
```
PluginInstallFromMarketplaceUseCase → MarketplaceRegistry + PluginFetcher (git clone)
→ Distribution (per-tool rewrite) → FileSystem → PostInstallPipeline
```

**Translate, author-side** (`aidd translate <source> --to <target> --out <dir>`):
```
FrameworkBuildUseCase → BuildOutputStrategy (MarketplaceBuildStrategy | FlatBuildStrategy, reading per-tool ToolBuildContract)
→ tool-native plugin tree (author-side distribution; all 5 targets shipped — claude/cursor/copilot/codex marketplace+flat, opencode flat-only)
```
Author-side, not user-side: translates the Claude-format framework into a tool-native
marketplace dist (`--as marketplace`, the default) or flat workspace materialization
(`--as flat`). Renamed from `framework build` in phase 18.

**Manifest version guard** (no command — checked on load):
```
Manifest.fromJSON → version guard in manifest.ts: reads v6 only
→ older manifest refused, naming the last CLI able to migrate it forward; newer manifest refused, naming self-update
```
The version-to-version migration chain (v1→v2→…→v6) was removed once no supported CLI could
still be behind v6 — a domain entity carrying every past shape of its own JSON was a
persistence concern, not a domain one. The brownfield `aidd migrate` command (backup + strip
dead files + rewire plugins) was removed earlier for the same reason.

## Per-Tool Plugin Install Strategy

Controlled by `PluginsCapability` in each tool definition. How each tool **actually
loads** plugins (verified live against each tool's real CLI/IDE, not inferred):

| Tool | How plugins load | aidd writes |
|---|---|---|
| Claude | `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`) — read natively, no CLI step | the settings file |
| Cursor | materialized to `~/.cursor/plugins/local/<name>/` (user-scope) — auto-discovered as "Local" plugins | the plugin files |
| OpenCode | flat files `.opencode/skills/`, `.opencode/agents/` — auto-discovered | the flat files |
| Codex | **native CLI activation** (`codex plugin add`) into user-global `~/.codex/` + cache | drives the CLI |
| Copilot | **native CLI activation** (`copilot plugin install`) into user-global `~/.copilot/` | drives the CLI + a recommendations file |

- **Some tools' project config is inert — they need native CLI activation.** Codex and
  Copilot do not load plugins from a project file (Codex reads only user-global
  `~/.codex/`; Copilot's `enabledPlugins` only *recommends*). aidd drives their
  `<tool> plugin` subcommands instead. Claude / Cursor / OpenCode do load their project
  artifacts natively. Which tools auto-load vs need activation is a per-tool fact —
  verify it against the real tool, never assume.
- `flat` mode: plugins installed as flat files under a namespace prefix; no native marketplace concept (OpenCode only)

## Auth

Token resolution: `AIDD_TOKEN` env → project `.aidd/auth.json` → user `~/.config/aidd/auth.json` → `gh auth token` (only when `method: "gh"`) → none

## Bundled Assets

Runtime configs, IDE configs, and JSON schemas ship inside the CLI binary (tsup bundles them):
- `src/runtime/assets/asset-loader.ts` — typed loader, esbuild text/json loaders at build time
- `.md` files → text loader (string); `.json` → native import (object); `.toml` → text loader (string)
- No fs reads at runtime — all assets inlined at bundle time

## Bundle Budget

- Budget: 500 KB (`bundleBudgetKB` in `package.json`)
- Enforced at build time: `scripts/check-bundle-size.mjs` runs after `tsup`

## File Ownership

Two regimes live side by side on disk. Confusing them is the main source of accidental
complexity in the install and repair paths.

| Regime | Examples | On drift |
| --- | --- | --- |
| CLI-owned | generated tool trees, gitignored | regenerate from source |
| Co-owned with the user | `settings.json`, `.mcp.json`, `.vscode/` | merge and report conflicts |

Hash tracking and per-file merge on CLI-owned files is over-engineering: the canonical
source can always reproduce them. Blind rewriting of co-owned files destroys the user's
own edits, which is why merge strategies and MCP exclusions exist.

This distinction is what `doctor` and `sync` should be scoped by — see
`aidd_docs/tasks/2026_08/2026_08_20_refactor-contextes-cli/`.

## Key Design Decisions

- Merge files (JSON/TOML): surgical key-level tracking; uninstall removes only AIDD keys
- IDE-conditional distribution: AI tools declare `requiredIdeIds`; filtered at install time
- IDE tool files (user-prime): never deleted on uninstall
- Error handling: typed exceptions thrown from use-cases/adapters; caught only at command layer
- Manifest version guard: reads v6 only, refuses older/newer with the fix named in the error (`manifest.ts`), no manual command

## Foreign-Format Ingestion

Most of this pipeline was removed as dead code (no production caller — see the refactor task
folder's `arborescence.md`, "Suppressions actées"): the `loadForeign()` entry point, the
cursor/codex/opencode catalog parsers, and `NormalizedPlugin`. What remains is narrower —
`contexts/distribution/domain/catalog-parsers/copilot-marketplace-catalog.ts` reads Copilot's
own catalog shape (`.github/plugin/plugin.json`) into the same `PluginCatalog` shape the Claude
parser produces, so `distribution` can register a Copilot-hosted marketplace without a
tool-specific branch above it.
