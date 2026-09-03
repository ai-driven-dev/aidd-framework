# Codebase Map

## Where Things Live

The codebase is organised by context, not by layer. Each context under `contexts/` owns a
`domain/`, an `application/`, and (where it talks to the outside world) an `infrastructure/`.
`kernel/` is shared vocabulary; `presentation/` and `runtime/` are not contexts. The allowed
edges between contexts, and everything a context must keep private, are enforced by
`tests/architecture/context-graph.arch.test.ts` and `context-boundary.arch.test.ts` — read those
before writing about the boundary, not this file.

```
src/
├── cli.ts                      # commander setup, global flags, preAction/postAction hooks
├── kernel/                     # shared vocabulary — imports no context, carries no business logic
│   ├── tool.ts                  # AiToolId/IdeToolId/ToolId, tool-id parsing and guards
│   ├── source.ts                  # PluginSource union, parsing/serialization
│   ├── scope.ts                    # MarketplaceScope ("project" | "user") — a plugin CLI names it without importing distribution
│   ├── paths.ts                     # project-relative cache/build directory layout
│   ├── file.ts                       # FileHash, InstallationFile, FileDiff, GITKEEP_FILE
│   ├── merge.ts                       # MergeStrategy, merge-entry extraction
│   ├── semver.ts                       # isSemver/compareSemver — spoken by framework and by the self-updater
│   ├── jsonc.ts                        # stripJsonComments — leaf dependency of merge.ts
│   ├── markdown.ts                      # markdown helpers shared by ≥2 contexts
│   ├── errors.ts                         # every typed domain exception — one catalog, not one per layer
│   ├── materialization/                   # where content lands and how its links follow — flat-paths.ts, relative-link-rewrite.ts; called by tools' profile builds and translate's flat/marketplace strategies
│   └── ports/                               # ports with callers in ≥2 contexts: file-reader, file-writer, hasher, logger, asset-provider, prompter (framework + distribution)
├── presentation/                # everything that talks to a human — depends on contexts, never the reverse
│   ├── commands/                 # CLI wiring only, one file per command (see "Launchers" below for the rule a future launcher follows)
│   ├── display/                   # result rendering per command group (doctor, restore, setup, status)
│   ├── prompts/                    # interactive use-cases: menu, plugin-pick, setup-tools-prompt, setup-plugins-prompt, sync-conflict-resolver — ask the user, the decision stays in the context
│   ├── error-handler.ts            # central error handling
│   └── output.ts                   # stdout/stderr formatting (CLIOutput)
├── runtime/                     # technical services that are not a context — wired from runtime/wiring/, may depend on contexts, never depended on by one
│   ├── wiring/                   # one composition module per context (tools.ts, translate.ts, distribution.ts) plus framework.ts, the full composition root (createDeps/createMenuDeps)
│   ├── auth/                      # credential-store/oauth-provider/token-provider ports + auth-reader/auth-storage/gh-cli/gh-token/auth-provider adapters + login/logout/status/require-auth use-cases
│   │   └── ports/                  # credential-store, oauth-provider, token-provider
│   ├── filesystem/                 # FileAdapter (FileReader+FileWriter+FileMerger) and HasherAdapter — the kernel ports' concrete adapters, plus tools' FileMerger port
│   ├── assets/                      # BundledAssetProviderAdapter (the AssetProvider port's adapter) + text-assets.d.ts (*.md/*.toml module declarations) — configs/schemas bundled in the binary
│   ├── prompter/                    # the Prompter adapter (inquirer / silent) — the port itself lives at kernel/ports/prompter.ts
│   ├── http/                        # HTTP client
│   ├── git/                          # token injection for authenticated git fetches
│   ├── platform/                      # the Platform port + its adapter
│   ├── project-root/                   # project-root resolution
│   ├── self-update/                     # self-update-use-case, check-update-use-case, self-updater/latest-release-resolver/version-reader/version-control ports + their adapters
│   └── user-config-dir.ts                # where the CLI keeps what belongs to the user rather than a project — read by runtime/auth, runtime/wiring, and distribution's registry adapter
└── contexts/                    # bounded contexts — nothing imports another context's interior (context-boundary.arch.test.ts); no index.ts anywhere, barrels are forbidden
    ├── tools/                    # what the project targets, and how each target is configured — no application layer of its own: installing for a tool is framework's work, in framework/application/install/
    │   ├── domain/
    │   │   ├── profiles/          # one directory per tool: profile.ts (the AiTool<C>/IdeToolConfig) + build.ts (its ToolBuildContract) when the tool is a build target
    │   │   │   ├── claude/          # + claude-build-paths.ts
    │   │   │   ├── codex/            # + codex-paths.ts, codex-agent-toml.ts, toml.ts (codex-only TOML wrapper)
    │   │   │   ├── copilot/           # + copilot-paths.ts (read by this profile's own build.ts only)
    │   │   │   ├── cursor/             # + cursor-paths.ts
    │   │   │   ├── opencode/            # flat-only build target
    │   │   │   └── vscode/               # IDE tool — profile.ts only, no build contract
    │   │   ├── formats/            # tool formats shared by ≥2 profiles: command, placeholders, mcp-format, vscode-mcp-merge, opencode-mcp-merge, flat-hooks-merge, agent-frontmatter-strip
    │   │   ├── capabilities/        # content-translation capability classes: agents, commands, hooks, rules, skills + config-refs.ts (CONFIG_* names, ConfigRef)
    │   │   ├── ports/                # native-plugin-activator, file-merger, schema-validator (translate reads it, tools declares it)
    │   │   ├── contracts.ts          # AiTool<C>, Has* interfaces, IdeToolConfig, ToolConfig, UserFileSectionKey
    │   │   ├── registry.ts            # ToolConfig union, isAiTool(), registerTool(), getToolConfig(), hasToolSignals(), buildContractFor()
    │   │   ├── build-contract.ts       # ToolBuildContract, ArtifactContract — per-tool build shape
    │   │   ├── marketplace-catalog.ts   # catalog/manifest shaping shared by ≥2 tools' build contracts
    │   │   ├── settings-capability.ts    # co-owned with the user (settings.json et al.)
    │   │   ├── mcp-capability.ts          # co-owned with the user (.mcp.json et al.)
    │   │   ├── mcp-exclusion.ts            # win32 mcp transform
    │   │   ├── hooks-format.ts              # a tool's hooks format, read by whoever installs from it
    │   │   ├── plugins-capability.ts         # what a tool declares about plugins
    │   │   ├── marketplace-settings.ts        # per-tool marketplace registration shape
    │   │   ├── plugin-translation-mode.ts      # how a tool's plugins get translated
    │   │   └── marketplace-entry.ts             # per-tool marketplace registration entry
    │   └── infrastructure/         # native-plugin-cli-adapter + its abstract base — drives a tool's own plugin CLI
    ├── translate/                 # the core: canonical source → target-native content, for every tool at once — depends on tools + kernel only
    │   ├── domain/
    │   │   ├── formats/             # target-aware transforms: claude-root-path-rewrite, cursor-hooks, plugin-root-token-rewrite
    │   │   ├── content-translator.ts # PluginContentTranslator — one plugin's files → one tool's installed files, calling the tool's own rewriteContent
    │   │   ├── canon.ts               # FrameworkDescriptor, ContentSection, TemplateRef — the canonical framework-doc shape
    │   │   ├── plugin-distribution.ts  # PluginDistribution, PluginComponentFile — the canonical single-plugin shape
    │   │   ├── plugin-format.ts         # PluginFormat, probe paths derived from the profiles
    │   │   ├── plugin-translation-skip.ts # PluginTranslationSkip, ReadonlySkipList
    │   │   └── build-target.ts           # FrameworkBuildTarget, target/mode pairs derived from the profiles
    │   ├── application/
    │   │   ├── translate-source.ts    # FrameworkBuildUseCase — one source, N targets, `aidd translate`
    │   │   ├── shared-plugin-helpers.ts
    │   │   └── strategies/             # marketplace-build-strategy, flat-build-strategy, build-output-strategy, marketplace-strategy-helpers
    │   └── infrastructure/
    │       └── schema-validator.ts     # AjvSchemaValidatorAdapter
    ├── distribution/              # where content comes from and how it is fetched — a leaf: kernel only, knows no tool and no manifest
    │   ├── domain/
    │   │   ├── marketplace.ts          # Marketplace entry, scope, staleness
    │   │   ├── marketplace-cache-entry.ts
    │   │   ├── marketplace-source-mode.ts
    │   │   ├── catalog.ts               # PluginCatalog, PluginCatalogEntry + the Claude-shaped parser
    │   │   ├── catalog-parsers/          # readers for a non-Claude catalog shape (copilot)
    │   │   └── ports/                     # marketplace-registry, marketplace-cache, marketplace-trust-store, plugin-catalog-repository, plugin-fetcher, raw-catalog-fetcher
    │   ├── application/             # add / list / refresh / register-framework / resolve-marketplace / fetch-marketplace-source
    │   └── infrastructure/          # the adapters behind those six ports
    └── framework/                  # the installation record and everything done to a project — the only context allowed to reach the others
        ├── domain/
        │   ├── manifest.ts               # aggregate root: identity, consistency, version guard, entry point to its members
        │   ├── manifest-serialization.ts  # ManifestData shape, tools map <-> record conversion
        │   ├── manifest/                   # the aggregate's members: tool-entry, tracked-files, merge-files, mcp-exclusions
        │   ├── plugins/                      # a plugin, how it is declared, where it came from: installed-plugin, plugin-source-resolver, requested-version-policy
        │   ├── formats/                        # markdown-references.ts — moved in here in phase 19, one caller
        │   ├── doctor.ts                        # the diagnosis shape
        │   ├── install-scope.ts                  # project or user, and which a tool supports
        │   ├── project-context.ts                 # what a project is, seen from here
        │   ├── setup-flow.ts                       # the steps a first install goes through
        │   ├── config-capability.ts                 # runtime configuration a tool receives
        │   ├── tool-recommendations.ts
        │   └── ports/                                # manifest-repository, plugin-distribution-reader
        ├── application/                # + clean-use-case.ts, init-use-case.ts, status-use-case.ts, gitignore-use-case.ts, setup-use-case.ts — the interactive prompts moved to presentation/prompts/
        │   ├── doctor/                  # layout, merge-files, plugin, references, registration, tracked-files, doctor-use-case (orchestrator)
        │   ├── flows/                    # marketplace-check, marketplace-remove, marketplace-sync-settings
        │   ├── framework/                 # legacy name for the translator subtree below (pre-dates `aidd translate`)
        │   │   └── translator/             # built-tree-materialization, mode-a-marketplace, mode-b-flat-materialization, plugin-translator(-factory), resolve-plugin-translator
        │   ├── global/                    # doctor-all, restore-all, status-all, update-tools, update-ai-tools, update-ide-tools, update-one-tool, resolve-update-decision
        │   ├── install/                    # install-ai-tool, install-ide-tool, install-config, install-ide-config, install-runtime-config, post-install-pipeline
        │   │   └── content/                 # one engine, install-content-section, and the four descriptors it runs: agents, commands, rules, skills
        │   ├── plugin/                      # add, install(-from-marketplace), remove, list, search, update, plugin-helpers
        │   ├── restore/                      # tool-files, all-plugins, plugin, generate-tool-distribution, resolve-restore-decision, restore-drift-entries, restore-merge-files, restore-regular-files, restore-use-case (orchestrator)
        │   ├── setup/                          # setup-marketplace-source, setup-tools, project-context-detector
        │   ├── shared/                          # apply-plugin-files, detect-plugin-drift, ensure-built-marketplace — never called from commands
        │   └── uninstall/                        # uninstall-use-case (orchestrator), mcp-exclusion, ide, plugin, tools
        └── infrastructure/             # manifest-repository-adapter and plugin-distribution-reader-adapter
```

## Launchers

Arborescence invariant 9: a launcher locates and executes an external binary; it never embeds
that binary's application code. There is no launcher in the CLI today, and nothing violates the
invariant.

The kanban command used to. It deep-imported `../../../../kanban/src/...`, so the
CLI bundled kanban's source and had to declare kanban's four interface packages — 50 packages
and 24 MB installed by everyone, for a command hidden from `--help` and marked not ready. The
command was unwired until its product direction is settled; `kanban/` keeps its source and its
own tests, and `pnpm test:kanban` still runs them.

Re-wiring it means meeting the invariant, not repeating the shortcut — and `kanban/src` is
currently written against it: `kanban-deps.ts` states that the source "is a folder inside the
framework, not a standalone package", taking its output channel and docs directory from
whatever host mounts it. A launcher needs the opposite: an entry point that owns those itself.

The same choice arrives with the telemetry and governance CLIs, which are unbuilt. Spawn them
as subprocesses from the start.

## Use-Case Structure

| Domain | Orchestrator | Sub-use-cases |
|---|---|---|
| doctor | `contexts/framework/application/doctor/doctor-use-case.ts` | layout, merge-files, plugin, references, registration, tracked-files |
| restore | `contexts/framework/application/restore/restore-use-case.ts` | tool-files, all-plugins, plugin, generate-tool-distribution, resolve-restore-decision, restore-drift-entries, restore-merge-files, restore-regular-files |
| uninstall | `contexts/framework/application/uninstall/uninstall-use-case.ts` | plugin, mcp-exclusion, ide — drives `uninstall-tools-use-case.ts` beside it |
| setup | `contexts/framework/application/setup-use-case.ts` | setup/setup-marketplace-source, setup/setup-tools, setup/project-context-detector — the plugins-prompt and tools-prompt are `presentation/prompts/` classes it injects by type |
| global | — | update-all, status-all, restore-all, doctor-all (4 chain orchestrators) + update-ai-tools / update-ide-tools / update-one-tool helpers |
| plugin | `contexts/framework/application/plugin/` | add, install (+ install-from-marketplace), remove, list, search, update, plugin-helpers |

## Where to Add Things

| What | Where |
|------|-------|
| New CLI command | `presentation/commands/` + the top-level use-case it calls, in whichever context owns the concept |
| New interactive prompt (asks the user) | `presentation/prompts/` — the decision it feeds stays in the context |
| New use-case not yet claimed by a context | The context whose concept it serves. There is no root landing zone: `application/use-cases/` and `domain/models/` were drawn here for one and never existed, so a use case that fits no context is a sign the contexts are wrong, not that a lobby is missing |
| Shared use-case helper | the owning context's `application/shared/` |
| New runtime service (not a context: auth, http, git, platform, self-update, filesystem, assets) | `runtime/<service>/`, wired from `runtime/wiring/<context>.ts` |
| New AI/IDE tool | one profile directory in `contexts/tools/domain/profiles/<toolname>/` (`profile.ts` + `build.ts`) — see `tool-addition-cost.arch.test.ts` and the `tools` skill |
| New content-translation capability (agents/skills/commands/rules/hooks) | `Has*` in `contexts/tools/domain/contracts.ts` + class in `contexts/tools/domain/capabilities/` |
| New target-aware transform (a translate concern) | `contexts/translate/domain/formats/` |
| New string transform shared by ≥2 tool profiles | `contexts/tools/domain/formats/` |
| New string transform used by exactly one tool profile | that profile's own directory |
| New domain type not yet claimed by a context | Decide which context owns it before writing it. There is no landing zone: the pre-refactor tree is gone, and a type with no owner is a design question, not a placement one |
| New port used by one context | that context's own `domain/ports/` + adapter in that context's `infrastructure/` |
| New port used by ≥2 contexts | `kernel/ports/` + adapter in `runtime/` (see `runtime/filesystem/`, `runtime/assets/`, `runtime/prompter/` for the pattern) |
| New shared vocabulary (no logic, no context import) | `kernel/` |

## Tests

```
tests/
├── kernel/                    # unit — shared vocabulary tests, mirrors src/kernel/ (errors.unit.test.ts covers the whole catalog)
├── presentation/               # unit — commands, display, prompts, output, error-handler — mirrors src/presentation/
├── runtime/                     # unit/integration — auth, filesystem, assets, http, git, platform, project-root, prompter, self-update, wiring — mirrors src/runtime/
├── contexts/tools/             # unit — mirrors src/contexts/tools/ (profiles, registry, formats, capabilities, install/uninstall use-cases, native-plugin-cli adapter)
├── contexts/translate/          # unit/integration — mirrors src/contexts/translate/ (formats, content-translator, canon, build strategies, schema-validator)
├── contexts/distribution/        # unit/integration — mirrors src/contexts/distribution/
├── contexts/framework/            # unit/integration — mirrors src/contexts/framework/, including domain/formats/markdown-references
├── e2e/                        # full CLI invocation via runCli()
├── golden/                     # snapshot tests over a real built framework tree — never derive a snapshot from an absolute path
├── architecture/               # ratchets over source text — folder size, tool-addition cost, no-re-export, codebase-map, context-graph, context-boundary, referenced-paths, docs-do-not-lie, earned-sharing, orchestrator-deps
└── fixtures/
    ├── framework/               # minimal synthetic framework fixture
    └── framework-real/          # pinned real framework tag (plugins: aidd-async-dev, etc.)
```

## Key Files

| File | Purpose |
|------|---------|
| `runtime/wiring/framework.ts` | Full dependency graph (`createDeps`, `createMenuDeps`) — start here when wiring new deps; composes `runtime/wiring/{tools,translate,distribution}.ts` |
| `runtime/assets/asset-loader.ts` | Typed loader for configs/schemas bundled in binary |
| `kernel/errors.ts` | Every typed domain exception in the codebase — one catalog, not one per context |
| `contexts/tools/domain/contracts.ts` | All tool/capability interfaces, including `rewriteContent`/`reverseRewriteContent` — declared by tools, called by translate |
| `contexts/tools/domain/registry.ts` | Tool lookup, guards, signal detection |
| `contexts/framework/application/install/post-install-pipeline-use-case.ts` | Mandatory post-write sequence |
| `contexts/framework/application/shared/ensure-built-marketplace-use-case.ts` | Per-target built-tree cache — install/update materialize tools from it (build/install parity) |
| `contexts/framework/domain/manifest.ts` | Aggregate root — identity, consistency, version guard (reads v6 only, refuses older/newer with the fix) on load; delegates tracked files, merge files, mcp exclusions and plugins to `domain/manifest/` |
| `contexts/framework/domain/setup-flow.ts` | Aggregate — setup orchestration state |
| `tests/architecture/context-boundary.arch.test.ts` | The list of what each context declares public — the boundary, since there is no barrel file |
| `tests/architecture/context-graph.arch.test.ts` | The allowed edges between contexts, as code rather than prose |
