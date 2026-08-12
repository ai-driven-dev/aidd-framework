# Project Brief

## Executive Summary

- **Package**: `@ai-driven-dev/cli`
- **Vision**: Distribute a canonical AI-Driven Development framework consistently across multiple AI coding assistants, eliminating manual tool-specific adaptation
- **Mission**: CLI that resolves the AIDD framework from remote/local sources, generates tool-specific file distributions with content rewriting and frontmatter conversion, and tracks every generated file in a hash-based manifest

### Description

- Community product gated by GitHub authentication token
- CLI is the distribution backbone — not a generic scaffolding tool
- Framework assets: agents, commands, rules, skills, templates
- Supported tools: Claude Code, Cursor, GitHub Copilot, OpenCode, Codex (AI); VS Code (IDE)

## Core Domain

- Framework resolved from remote (GitHub Releases) or local path/tarball
- Files are rewritten per tool conventions (path, frontmatter, content format)
- Every installed file tracked in `.aidd/manifest.json` via MD5 hash
- Drift = local modification vs. what was written at install time

## Ubiquitous Language

| Term                 | Definition                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | Canonical set of agents, commands, rules, skills, templates                                                                                                                       |
| Distribution         | Tool-specific generated output (files rewritten per tool conventions)                                                                                                             |
| Manifest             | `.aidd/manifest.json` — hash-based tracking of every installed file                                                                                                               |
| ToolConfig           | Per-tool configuration: output paths, frontmatter conversion, merge rules. Tools: `claude` → `.claude/`, `cursor` → `.cursor/`, `copilot` → `.github/`, `opencode` → `.opencode/`, `codex` → `.codex/`, `gemini` → `.gemini/` (skills to the shared `.agents/skills/`) |
| Plugin               | Capability files (agents, commands, hooks, mcp, rules, skills) distributed per AI tool format via marketplace catalogs                                                            |
| Drift                | Installed file modified locally vs. what was written at install time                                                                                                              |
| Init                 | Bootstrap: CLI writes `.aidd/manifest.json` (+ `.aidd/cache` gitignore). The `aidd_docs/` memory bank is scaffolded by the `aidd-context` project-init skill, not the CLI binary    |
| Install              | Generates and writes tool-specific distribution files                                                                                                                             |

## Commands

### Bootstrap
| Command | Purpose |
|---|---|
| `aidd setup --source remote\|local [--path <dir>] [--release <tag>] [--ai <ids>] [--ide <ids>] [--plugins <none\|all\|recommended\|names>] [--no-default-marketplace] [--yes]` | Initialize project: marketplace + tools + plugins (`--ai all` / `--ide all` for everything) |

### AI tools (claude, cursor, copilot, codex, opencode, gemini)
| Command | Purpose |
|---|---|
| `aidd ai install <tool> [--force]` | Install AI tool runtime config |
| `aidd ai uninstall <tool>` | Remove tool config |
| `aidd ai list / status / update / restore / doctor` | Per-tool ops |

### IDE tools (vscode)
| Command | Purpose |
|---|---|
| `aidd ide install <tool> [--force]` | Install IDE config |
| `aidd ide uninstall / list / status / update / doctor` | Per-tool ops |

### Plugins
| Command | Purpose |
|---|---|
| `aidd plugin install [name\|local-path] [--from <market>] [--tool <id>] [--scope <user\|project>] [--token <v>] [--yes]` | Install from marketplace or local path; no arg → interactive pick |
| `aidd plugin create [name] / remove / list / update / search / doctor` | Plugin ops |

### Marketplaces
| Command | Purpose |
|---|---|
| `aidd marketplace add [name] [source] [--scope <user\|project>] [--yes] [--overwrite] [--token <v>]` | Register marketplace |
| `aidd marketplace list [--plugins] / remove / refresh [--force] / check` | Marketplace ops (cache cleared via `refresh --force`) |

### Auth
| Command | Purpose |
|---|---|
| `aidd auth login [--gh] [--token <v>] [--level user\|project]` | GitHub auth |
| `aidd auth logout / status` | Auth ops |

### Framework (authoring)
| Command | Purpose |
|---|---|
| `aidd framework build` | Build tool-specific framework distributions (5 targets × 2 modes). Maintainer/authoring command, not part of the consumer install flow |

### Globals (chain unitaries)
| Command | Purpose |
|---|---|
| `aidd update / status / restore / doctor` | Run across AI + IDE + plugins (`status --json` for a machine-readable report) |
| `aidd clean [--force]` | Nuke .aidd + tracked files |
| `aidd self-update` | Update CLI binary |

### Removed (architecture cleanup; current manifest = v6)
- `aidd sync` / `aidd ai sync` — removed with the build/install parity rework; `update` now re-materializes each tool from the built tree, so a separate sync step is gone (`sync-conflict-resolver` survives, reused by the update flow)
- `aidd cache list/clear` — removed; cache cleared via `aidd marketplace refresh --force`
- `aidd config list/get/set` — no remaining writable fields
- `aidd install [category] [tool]` — replaced by `aidd ai/ide install`
- `aidd uninstall [category] [tool]` — replaced by `aidd ai/ide uninstall`
- `aidd migrate [--dry-run] [--non-interactive]` — removed; manifests auto-upgrade to v6 on load (schema migration in `manifest.ts`), no explicit brownfield command
- Setup flags `--from / --switch-mode / --mode / --path` (path kept only with `--source local`) / `--release`
- Install flags `--path / --release / --plugins / --mcp / --all-plugins / --recommended-plugins / --no-plugins`
- Global `--repo` flag; `AIDD_REPO` env var gone from source
- `FrameworkResolver`, `FrameworkCache`, `ResolveFrameworkUseCase`, `InstallFrameworkPluginsUseCase`, `AdoptUseCase` — removed classes
- `MemoryCapability` — memory stubs moved to plugin ownership; no `memory-capability.ts` in source
- Manifest fields: `mode / scripts / repo / docsDir / docs / plugins(top-level)` — all removed

## User Journey

### Multi-Tool Developer

```mermaid
journey
    section Install
      Run aidd ai install claude: 5: Multi-Tool Dev
      Run aidd ai install cursor: 5: Multi-Tool Dev
      Files generated in .claude/ and .cursor/: 5: CLI
    section Drift
      Modify some files locally: 3: Multi-Tool Dev
      Run aidd status: 5: Multi-Tool Dev
      Drift detected per tool: 5: CLI
    section Restore
      Run aidd ai restore claude --force: 4: Multi-Tool Dev
      Files reverted to installed version: 5: CLI
```
