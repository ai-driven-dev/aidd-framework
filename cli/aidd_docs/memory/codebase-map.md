# Codebase Map

## Where Things Live

```
src/
├── cli.ts                    # Entry point — commander setup, global flags, preAction hook
├── application/
│   ├── commands/             # CLI wiring only (1 file per command)
│   ├── display/              # result rendering per command group (doctor, restore, setup, status)
│   ├── use-cases/            # Business orchestration
│   │   ├── auth/             # login / logout / status / require-auth
│   │   ├── doctor/           # orchestrator + layout / merge-files / plugin / references / tracked-files
│   │   ├── framework/        # author-side build: source → target-native distribution
│   │   │   └── strategies/   # marketplace and flat build strategies, per-tool build contracts
│   │   ├── global/           # cross-tool chains: update-all / status-all / restore-all / doctor-all / update-one-tool / resolve-update-decision
│   │   ├── install/          # capability sub-use-cases: runtime-config / ide-config / agents / commands / rules / skills / config / post-install-pipeline
│   │   ├── marketplace/      # marketplace lifecycle: add / list / remove / refresh / check / register-framework / sync-settings
│   │   ├── plugin/           # create / add / install / install-from-marketplace / remove / list / update / search / pick
│   │   │   └── translator/   # per-tool materialization strategies (native, flat, built-tree)
│   │   ├── restore/          # orchestrator + tool-files / all-plugins / plugin / generate-tool-distribution / resolve-restore-decision / restore-drift-entries / restore-merge-files / restore-regular-files
│   │   ├── setup/            # sub-use-cases: marketplace-source / tools / plugins-prompt
│   │   ├── sync/             # conflict-resolver only — drift/conflict resolution reused by the update flow
│   │   ├── uninstall/        # orchestrator + tools / plugin / mcp-exclusion / ide
│   │   ├── gitignore-use-case.ts  # used by clean / init / install (post-install-pipeline)
│   │   └── shared/           # earns its place with callers in ≥2 areas — see 0-shared-modules.md
│   │       └── resolve-marketplace/  # private step of resolve-marketplace-use-case.ts only
│   ├── error-handler.ts      # central error handling
│   ├── errors.ts             # application typed exceptions
│   └── output.ts             # stdout/stderr formatting
├── domain/
│   ├── formats/              # pure string transforms — no I/O (command, json, jsonc, markdown, toml, placeholders, cursor-hooks, mcp-format, markdown-references, *-marketplace parsers)
│   ├── models/               # entities, value objects, discriminant types
│   ├── ports/                # interface contracts (FileSystem, Hasher, Logger, Prompter, LatestReleaseResolver, etc.)
│   ├── capabilities/         # one capability class per Has* interface (agents, commands, rules, skills, hooks, mcp, settings, plugins, marketplace-entry)
│   └── tools/
│       ├── contracts.ts      # AiTool<C>, Has* interfaces, IdeToolConfig, UserFileSectionKey
│       ├── registry.ts       # ToolConfig union, isAiTool(), registerTool(), getToolConfig(), hasToolSignals()
│       ├── ai/               # one file per AI tool (claude, cursor, copilot, opencode, codex)
│       └── ide/              # one file per IDE tool (vscode)
└── infrastructure/
    ├── adapters/             # port implementations — one adapter per port (incl. auth-reader, auth-storage, http-client)
    ├── assets/               # asset-loader.ts — typed loader for configs/stubs bundled in binary
    ├── auth/                 # credential resolution
    ├── git/                  # token injection for authenticated git fetches
    ├── http/                 # HTTP client
    ├── deps.ts               # dependency injection wiring
    └── errors.ts             # infrastructure typed exceptions (internal only)
```

## Use-Case Structure

| Domain | Orchestrator | Sub-use-cases |
|---|---|---|
| doctor | `doctor-use-case.ts` | layout, merge-files, plugin, references, tracked-files |
| restore | `restore-use-case.ts` | tool-files, all-plugins, plugin, generate-tool-distribution, resolve-restore-decision, restore-drift-entries, restore-merge-files, restore-regular-files |
| uninstall | `uninstall-use-case.ts` | tools, plugin, mcp-exclusion, ide |
| setup | `setup-use-case.ts` | marketplace-source, tools, plugins-prompt |
| global | — | update-all, status-all, restore-all, doctor-all (4 chain orchestrators) + update-ai-tools / update-ide-tools helpers |

## Where to Add Things

| What | Where |
|------|-------|
| New CLI command | `application/commands/` + top-level use-case |
| New use-case | `application/use-cases/<subdir>/` or root for top-level |
| Shared use-case helper | `application/use-cases/shared/` |
| New AI tool | `domain/tools/ai/<toolname>.ts` |
| New capability | `Has*` in `contracts.ts` + class in `domain/capabilities/` |
| New string transform | `domain/formats/` |
| New domain type | `domain/models/` |
| New port | `domain/ports/` + adapter in `infrastructure/adapters/` |

## Tests

```
tests/
├── application/use-cases/    # unit — use-cases with in-memory ports from tests/helpers/ports/
├── domain/capabilities/      # unit — capability class tests
├── domain/formats/           # unit — format parser tests (incl. *-marketplace parsers)
├── domain/models/            # unit — pure value object tests; manifest.property.unit.test.ts (property-based)
├── domain/tools/             # unit — tool config tests
├── e2e/                      # full CLI invocation via runCli()
├── infrastructure/           # adapter tests with mock servers/fixtures
└── fixtures/
    ├── framework/            # minimal synthetic framework fixture
    └── framework-real/       # pinned real framework tag (plugins: aidd-async-dev, etc.)
```

## Key Files

| File | Purpose |
|------|---------|
| `infrastructure/deps.ts` | Full dependency graph — start here when wiring new deps |
| `infrastructure/assets/asset-loader.ts` | Typed loader for configs/stubs bundled in binary |
| `domain/tools/contracts.ts` | All tool/capability interfaces |
| `domain/tools/registry.ts` | Tool lookup, guards, signal detection |
| `application/use-cases/install/post-install-pipeline-use-case.ts` | Mandatory post-write sequence |
| `application/use-cases/shared/ensure-built-marketplace-use-case.ts` | Per-target built-tree cache — install/update materialize tools from it (build/install parity) |
| `domain/models/manifest.ts` | Aggregate root — all installed file tracking + schema migration (v1→v6) on load |
| `domain/models/normalized-plugin.ts` | Internal AST for foreign-format plugin ingestion |
| `domain/models/setup-flow.ts` | Aggregate — setup orchestration state |
