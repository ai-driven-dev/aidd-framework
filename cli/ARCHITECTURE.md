# Architecture

## Contexts, not layers

```
presentation ──> contexts ──> kernel
runtime ─────────> (wiring only)

framework ──> translate ──> tools ──> kernel
framework ──> distribution ─────────> kernel
```

| where | what lives there |
|---|---|
| `src/kernel/` | the vocabulary every context speaks: tool identity, source location, paths, files and fingerprints, merge strategies, errors, and the ports used by two contexts or more. It imports no context and carries no business logic. |
| `src/contexts/tools/` | what the project targets and how each target is configured. One directory per tool: its profile beside its build contracts. |
| `src/contexts/translate/` | canonical source into target-native content, at every level. |
| `src/contexts/distribution/` | where content comes from and how it is fetched. A leaf: it knows no tool and no installation record. |
| `src/contexts/framework/` | the installation record and everything done to a project. The only context allowed to reach the others. |
| `src/presentation/` | what speaks to a human: commands, display, prompts, output. |
| `src/runtime/` | technical services and wiring: auth, http, git, platform, project root, self-update, one wiring module per context. |

Three invariants hold this together, and each is enforced by a test rather than by this
document. `tests/architecture/context-graph.arch.test.ts` allows exactly the edges drawn
above. `tests/architecture/context-boundary.arch.test.ts` refuses an import that reaches
a context's interior: a cross-context import targets a module that context declares
public, and there is no barrel file anywhere to make that convenient. A biome override
refuses an import from the kernel into any context.

## Key Domain Models (manifest v6)

| Model | Description |
|---|---|
| `SetupFlow` | Aggregate carrying all setup parameters (source, tools, pluginMode, interactive) |
| `MarketplaceSourceMode` | Value object: `remote()` or `local(path)` |
| `Marketplace` | A registered marketplace (name, source, scope). Registry stored at `.aidd/marketplaces.json`, not in the manifest |
| `MarketplaceCacheEntry` | Cached catalog fetch (marketplace name, fetchedAt, size) |
| `Manifest` (v6) | Top-level schema: `version`, `tools`. Plugins live per-tool under `tools[id].plugins`. Stripped top-level fields: `docsDir`, `repo`, `mode`, `scripts`, `plugins`, `topPlugins`, `marketplaces`. Stored at `.aidd/manifest.json` |
| `Plugin` | Installed plugin: id, source (marketplace + version), tool, files |
| `PluginDistribution` | Capability files for a plugin as fetched from the source |

## Command Surface (grammar, not noun-first)

A bare verb is an action performed now, on the CLI or the current project. A noun then a
verb manages a resource's lifecycle — same convention Claude Code and Codex follow.

```
# actions — bare verb
aidd setup                              — bootstrap the whole project (marketplace + framework + tools + plugins)
aidd doctor    [--tool ...] [--plugin]  — detected/equipped tools, plugins, drift, problems
aidd sync      [--tool ...] [--plugin]  — regenerate owned files, driven by the manifest
aidd translate <source> --to <target>   — convert an arbitrary source, records nothing
aidd update | upgrade                   — update the CLI itself
aidd clean                              — remove all AIDD-managed files
aidd auth                               — credential management (login/logout/status)

# resources — noun then verb
aidd framework    install | update | remove          [--tool ...]
aidd plugin       install | update | remove | list | search   [--tool ...]
aidd marketplace  add | refresh | remove | list
```

Phase 18 (`aidd_docs/tasks/2026_08/2026_08_20_refactor-contextes-cli/`) moved the surface:

| Removed | Replacement |
|---|---|
| `aidd ai <verb>` / `aidd ide <verb>` | `--tool <id>` on `doctor`, `sync`, `framework install\|update\|remove` |
| `aidd status`, `aidd ai status`, `aidd ide status` | `aidd doctor` |
| `aidd ai doctor`, `aidd ide doctor`, `aidd plugin doctor` | `aidd doctor --tool` / `aidd doctor --plugin` |
| `aidd restore`, `aidd ai restore`, `aidd ide restore` | `aidd sync` |
| `aidd self-update` | `aidd update` |
| `aidd framework build` | `aidd translate` |
| `aidd plugin create` | removed — never documented, never used |

`aidd cache`, `aidd config`, top-level `aidd install`, and top-level `aidd uninstall` were removed in an earlier pass. Plugin browsing is folded into `aidd plugin install` (no arg); marketplace cache is managed via `aidd marketplace refresh --force`.

## Plugin Architecture

Plugins are distributed via marketplace catalogs (Git repos with `marketplace.json` + `plugins/`). Each plugin provides capability files (agents, commands, hooks, mcp, rules, skills) per AI tool format. The CLI translates plugin distributions between tool formats using reverse + forward content rewriting (plugin sync pipeline).

Memory ownership (CLAUDE.md, AGENTS.md, copilot-instructions.md) is delegated to the `aidd-context` plugin — not bundled in the CLI binary.

## Translate (author-side)

`aidd translate` (renamed from `framework build` in phase 18) converts a Claude-format framework source into a target-native distribution. Five targets (`claude`, `cursor`, `copilot`, `codex`, `opencode`) × two modes (`marketplace`, `--as flat`); `opencode` is flat-only, so 9 build cells. The orchestrators (`MarketplaceBuildStrategy`, `FlatBuildStrategy`) read a per-tool `ToolBuildContract` — no per-tool branching. **Scope:** skills, agents, mcp, and hooks are emitted; `rules` and `commands` are currently out of scope (warn + skip per plugin). See `README.md` → `aidd translate` for the per-tool layout matrix.

## Dependency Wiring

- `createDeps(projectRoot, globalOptions, output)` — full dep graph, memoized per project root
- `createMenuDeps()` — pre-parse only (ManifestRepository + Prompter)
- `deps.ts` assembles the entire adapter graph; commands never instantiate adapters directly

## Testing

- `*.unit.test.ts` — domain models, pure functions; no I/O
- `*.integration.test.ts` — use-cases and adapters with real temp filesystem
- `*.e2e.test.ts` — full CLI binary invocation via `runCli()`, temp dir per test
