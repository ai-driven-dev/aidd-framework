# Codebase Map

## Where Things Live

```
src/
├── cli.ts                    # Entry point — commander setup, global flags, preAction hook
├── kernel/                   # shared vocabulary — no business logic, imports no context (biome-enforced)
│   ├── tool.ts                # AiToolId/IdeToolId/ToolId, tool-id parsing and guards
│   ├── source.ts               # PluginSource union, parsing/serialization
│   ├── paths.ts                 # project-relative cache/build directory layout
│   ├── file.ts                   # FileHash, InstallationFile, FileDiff, GITKEEP_FILE
│   ├── merge.ts                   # MergeStrategy, ConflictDecision, merge-entry extraction
│   ├── jsonc.ts                    # stripJsonComments — leaf dependency of merge.ts
│   ├── errors.ts                    # domain typed exceptions
│   └── ports/                        # ports with callers in ≥2 contexts: file-reader, file-writer, hasher, logger, asset-provider
├── application/
│   ├── commands/             # CLI wiring only (1 file per command)
│   ├── display/              # result rendering per command group (doctor, restore, setup, status)
│   ├── use-cases/            # Business orchestration
│   │   ├── auth/             # login / logout / status / require-auth
│   │   ├── doctor/           # orchestrator + layout / merge-files / plugin / references / tracked-files
│   │   ├── flows/            # cross-area flows, pending phase 13 placement: marketplace-check / marketplace-remove / marketplace-sync-settings
│   │   ├── framework/        # author-side build: source → target-native distribution
│   │   │   ├── strategies/   # marketplace and flat build strategies, per-tool build contracts
│   │   │   └── translator/   # per-tool materialization strategies (native, flat, built-tree), applied and recorded at install time
│   │   ├── global/           # cross-tool chains: update-all / status-all / restore-all / doctor-all / update-one-tool / resolve-update-decision
│   │   ├── install/          # capability sub-use-cases: agents / commands / rules / skills / content-section / post-install-pipeline — tool-specific installs live in contexts/tools/application/
│   │   ├── marketplace/      # marketplace lifecycle: add / list / refresh / register-framework
│   │   ├── plugin/           # create / add / install / install-from-marketplace / remove / list / update / search / pick
│   │   ├── restore/          # orchestrator + tool-files / all-plugins / plugin / generate-tool-distribution / resolve-restore-decision / restore-drift-entries / restore-merge-files / restore-regular-files
│   │   ├── setup/            # sub-use-cases: marketplace-source / tools / plugins-prompt
│   │   ├── sync/             # conflict-resolver only — drift/conflict resolution reused by the update flow
│   │   ├── uninstall/        # orchestrator + plugin / mcp-exclusion / ide — drives contexts/tools/application/uninstall-tools-use-case.ts
│   │   ├── gitignore-use-case.ts  # used by clean / init / install (post-install-pipeline)
│   │   └── shared/           # earns its place with callers in ≥2 areas — see 0-shared-modules.md
│   │       └── resolve-marketplace/  # private step of resolve-marketplace-use-case.ts only
│   ├── error-handler.ts      # central error handling
│   ├── errors.ts             # application typed exceptions
│   └── output.ts             # stdout/stderr formatting
├── domain/
│   ├── formats/              # pure string transforms — no I/O (command, json, markdown, toml, placeholders, cursor-hooks, mcp-format, markdown-references)
│   ├── models/               # entities, value objects, discriminant types
│   ├── ports/                # interface contracts owned by one context (Prompter, ManifestRepository, LatestReleaseResolver, etc.) — ports shared by ≥2 contexts live in kernel/ports/
│   └── capabilities/         # one capability class per Has* interface — content-translation capabilities only (agents, commands, rules, skills, hooks, plugins, marketplace-entry, marketplace-settings); mcp and settings moved to contexts/tools
├── infrastructure/
│   ├── adapters/             # port implementations — one adapter per port (incl. auth-reader, auth-storage, http-client)
│   ├── assets/               # asset-loader.ts — typed loader for configs/stubs bundled in binary
│   ├── auth/                 # credential resolution
│   ├── git/                  # token injection for authenticated git fetches
│   ├── http/                 # HTTP client
│   ├── deps.ts               # dependency injection wiring
│   └── errors.ts             # infrastructure typed exceptions (internal only)
└── contexts/                 # bounded contexts — nothing imports another context's interior
    └── tools/                # what the project targets, and how each target is configured — no index.ts (no barrels, ever)
        ├── domain/
        │   ├── profiles/     # one file per tool: claude, cursor, copilot, codex, opencode (AI), vscode (IDE) — paths, formats, capabilities, build contract
        │   ├── registry.ts   # ToolConfig union, isAiTool(), registerTool(), getToolConfig(), hasToolSignals()
        │   ├── contracts.ts  # AiTool<C>, Has* interfaces, IdeToolConfig, UserFileSectionKey
        │   ├── build-contract.ts      # ToolBuildContract, ArtifactContract — per-tool build shape
        │   ├── settings-capability.ts # co-owned with the user (settings.json et al.)
        │   ├── mcp-capability.ts      # co-owned with the user (.mcp.json et al.)
        │   ├── mcp-exclusion.ts       # win32 mcp transform
        │   └── ports/        # native-plugin-activator, file-merger
        ├── application/      # install-ai-tool / install-ide-tool / install-config / install-ide-config / install-runtime-config / uninstall-tools
        └── infrastructure/   # native-plugin-cli-adapter + its abstract base — drives a tool's own plugin CLI
```

## Use-Case Structure

| Domain | Orchestrator | Sub-use-cases |
|---|---|---|
| doctor | `doctor-use-case.ts` | layout, merge-files, plugin, references, tracked-files |
| restore | `restore-use-case.ts` | tool-files, all-plugins, plugin, generate-tool-distribution, resolve-restore-decision, restore-drift-entries, restore-merge-files, restore-regular-files |
| uninstall | `uninstall-use-case.ts` | plugin, mcp-exclusion, ide — drives `contexts/tools/application/uninstall-tools-use-case.ts` |
| setup | `setup-use-case.ts` | marketplace-source, tools, plugins-prompt |
| global | — | update-all, status-all, restore-all, doctor-all (4 chain orchestrators) + update-ai-tools / update-ide-tools helpers |

## Where to Add Things

| What | Where |
|------|-------|
| New CLI command | `application/commands/` + top-level use-case |
| New use-case | `application/use-cases/<subdir>/` or root for top-level |
| Shared use-case helper | `application/use-cases/shared/` |
| New AI/IDE tool | one profile file in `contexts/tools/domain/profiles/<toolname>.ts` — see `tool-addition-cost.arch.test.ts` |
| New content-translation capability (agents/skills/commands/rules/hooks) | `Has*` in `contexts/tools/domain/contracts.ts` (moving to `contexts/translate` in a later phase) + class in `domain/capabilities/` |
| New string transform | `domain/formats/` |
| New domain type | `domain/models/` |
| New port used by one context | that context's `domain/ports/` (or `domain/ports/` for code not yet in a context) + adapter in `infrastructure/adapters/` (or that context's `infrastructure/`) |
| New port used by ≥2 contexts | `kernel/ports/` + adapter in `infrastructure/adapters/` |
| New shared vocabulary (no logic, no context import) | `kernel/` |

## Tests

```
tests/
├── kernel/                   # unit — shared vocabulary tests, mirrors src/kernel/
├── application/use-cases/    # unit — use-cases with in-memory ports from tests/helpers/ports/
├── domain/capabilities/      # unit — capability class tests
├── domain/formats/           # unit — format parser tests
├── domain/models/            # unit — pure value object tests; manifest.property.unit.test.ts (property-based)
├── contexts/tools/           # unit — mirrors src/contexts/tools/ (profiles, registry, install/uninstall use-cases, native-plugin-cli adapter)
├── e2e/                      # full CLI invocation via runCli()
├── infrastructure/           # adapter tests with mock servers/fixtures
├── architecture/             # ratchets over source text — folder size, tool-addition cost, no-re-export, codebase-map, etc.
└── fixtures/
    ├── framework/            # minimal synthetic framework fixture
    └── framework-real/       # pinned real framework tag (plugins: aidd-async-dev, etc.)
```

## Key Files

| File | Purpose |
|------|---------|
| `infrastructure/deps.ts` | Full dependency graph — start here when wiring new deps |
| `infrastructure/assets/asset-loader.ts` | Typed loader for configs/stubs bundled in binary |
| `contexts/tools/domain/contracts.ts` | All tool/capability interfaces |
| `contexts/tools/domain/registry.ts` | Tool lookup, guards, signal detection |
| `application/use-cases/install/post-install-pipeline-use-case.ts` | Mandatory post-write sequence |
| `application/use-cases/shared/ensure-built-marketplace-use-case.ts` | Per-target built-tree cache — install/update materialize tools from it (build/install parity) |
| `domain/models/manifest.ts` | Aggregate root — all installed file tracking + schema migration (v1→v6) on load |
| `domain/models/normalized-plugin.ts` | Internal AST for foreign-format plugin ingestion |
| `domain/models/setup-flow.ts` | Aggregate — setup orchestration state |
