# AIDD CLI

`@ai-driven-dev/cli` installs AI tool runtime configs, IDE integrations, and plugins from an AIDD marketplace into a project.
Every file it writes is hash-tracked in a manifest, so drift is detected and owned files can be restored.

Supported AI tools: Claude Code, Cursor, GitHub Copilot, Codex, OpenCode. Supported IDE: VS Code.
Requires Node.js >= 22.12, and `git` to fetch marketplace plugins.

## Install

Run without installing:

```sh
npx @ai-driven-dev/cli@latest setup
```

Or install once for every project:

```sh
npm install -g @ai-driven-dev/cli@latest
aidd --version
```

## Quickstart

```sh
aidd setup --ai claude --ide vscode --plugins recommended --yes
aidd plugin install aidd-dev
aidd doctor
aidd sync
aidd update
```

The first command bootstraps the project: manifest, default marketplace, tool configs, plugins.
`--scope user` on `setup` registers the framework source and native activation machine-wide instead, and writes nothing under the project.

## Authentication

Not needed for the public marketplace. Needed for a private one.

Two methods are stored in `auth.json`:

- `stored`: the token itself is written to the file, from `--token <value>`.
- `external`: only the provider name is written, and the token is asked from it at fetch time, from `--gh`.

Token resolution stops at the first hit:

1. `AIDD_TOKEN`.
2. The project file, `.aidd/auth.json`.
3. The user file, `auth.json` in the user config directory.

`aidd auth login --level project` writes the project file, `--level user` the user one.
`aidd plugin install --token <value>` and `aidd marketplace add --token <value>` pass a token for one call without storing it.

## Commands

Run `aidd --help`, then a group's own `--help`, for flags this page does not repeat.

### Project lifecycle

| Command | Does |
| --- | --- |
| `aidd setup` | Bring the whole project to a correct state: marketplace, tool configs, plugins |
| `aidd doctor` | Report detected tools, installed plugins, drift, and what to run to fix each |
| `aidd sync` | Rewrite owned files from the manifest, then re-drive native activation |
| `aidd clean` | Remove every AIDD-managed file from the project |
| `aidd update` | Update the CLI itself, aliased `upgrade` |

`setup`, `doctor`, `sync` and `clean` accept `--scope <project|user>`. Project scope is the default and acts on this project alone.

### Framework

| Command | Does |
| --- | --- |
| `aidd framework install` | Write one tool's runtime configuration from the bundled assets |
| `aidd framework update` | Move installed tools to this CLI's assets, all of them without `--tool` |
| `aidd framework remove` | Delete the generated configuration files of one tool |
| `aidd framework rules` | List the rules installed across every AI tool, `--json` for a machine |

### Plugins

| Command | Does |
| --- | --- |
| `aidd plugin install` | Install a plugin by marketplace name, by local path, or by interactive pick |
| `aidd plugin list` | List installed plugins for one tool or all of them |
| `aidd plugin update` | Move one plugin, or every plugin, to the catalog's current version |
| `aidd plugin remove` | Uninstall a plugin from one tool or all of them |
| `aidd plugin search` | Search registered marketplaces, `--recommended` for the curated set |

### Marketplaces

| Command | Does |
| --- | --- |
| `aidd marketplace add` | Register a marketplace by name and source |
| `aidd marketplace list` | List registered marketplaces, `--plugins` also prints their catalogs |
| `aidd marketplace refresh` | Re-fetch catalogs, `--force` clears the cache first |
| `aidd marketplace check` | Report stale catalogs and plugins removed upstream |
| `aidd marketplace remove` | Unregister a marketplace and offer to clean its orphans |

### Auth

| Command | Does |
| --- | --- |
| `aidd auth login` | Store a credential, `--token <value>` or `--gh` |
| `aidd auth status` | Show which credential resolves, from where, at which level |
| `aidd auth logout` | Delete the stored credential |

### Telemetry

Opt-in, off until asked. Record shapes and report axes: [`../plugins/aidd-telemetry/README.md`](../plugins/aidd-telemetry/README.md).

| Command | Does |
| --- | --- |
| `aidd telemetry on` | Flip the git-tracked switch on and git-ignore the run journal |
| `aidd telemetry off` | Flip the switch off, warning when a tool still exports on its own |
| `aidd telemetry check` | Say whether the chain is actually recording for this project |
| `aidd telemetry read` | Read session cost from the files the tools already wrote |
| `aidd telemetry report` | Report a period, or one task in it, along one `--axis` |
| `aidd telemetry identity` | Attach or drop this person's identifier: `use`, `off`, `link`, `unlink` |
| `aidd telemetry forget` | Irreversibly drop the journal, the stored records, and the identity file |

## Translate

`aidd translate <source> --to <tool> --out <dir>` converts a framework source tree into a target-native plugin tree.
It records nothing in the manifest, unlike `aidd sync`. It is the author-side command that produces what consumers install.

Two output layouts, chosen by `--as`:

- `marketplace`, the default: a self-contained marketplace tree the consumer registers with `aidd marketplace add`, with plugin paths rewritten to the target's own plugin-root token.
- `flat`: plugin content materialized straight under the target's workspace directory, with no marketplace step. `--force` overwrites files already at those paths, and applies to this layout only.

| Target | `marketplace` | `flat` | Workspace directory |
| --- | --- | --- | --- |
| `claude` | yes | yes | `.claude/` |
| `cursor` | yes | yes | `.cursor/` |
| `copilot` | yes | yes | `.github/` |
| `codex` | yes | yes | `.codex/` |
| `opencode` | no | yes | `.opencode/` |

OpenCode declares no marketplace contract, so it is flat only. Every other target accepts both layouts.

## Environment variables

| Variable | Effect |
| --- | --- |
| `AIDD_TOKEN` | Token used for every fetch, ahead of any stored credential |
| `AIDD_USER_CONFIG_DIR` | Relocates the user config directory outright, credentials included |
| `XDG_CONFIG_HOME` | Names the config root when `AIDD_USER_CONFIG_DIR` is unset |
| `AIDD_TELEMETRY_DIR` | Names where telemetry records are kept, ahead of the config directory |
| `AIDD_RUNS_DIR` | Names the run journal directory, read alike by the CLI and the hook |
| `AIDD_SKIP_UPDATE_CHECK` | Set to `1`, skips the self-update check before a command |

Share `AIDD_TELEMETRY_DIR` to pool figures across a team. Never share `AIDD_USER_CONFIG_DIR`: it also moves `auth.json`.

## Where things live

In the project:

| Path | Holds |
| --- | --- |
| `.aidd/manifest.json` | Every owned file and its hash |
| `.aidd/config.json` | The telemetry switch, git-tracked, kept by `clean` |
| `.aidd/auth.json` | The project-level credential |
| `.aidd/marketplaces.json` | Marketplaces registered at project scope |
| `.aidd/cache/`, `.aidd/plugin-cache/` | Fetched catalogs, built trees, plugin sources |
| `aidd_docs/runs/` | The run journal, at the repository root above the project |

On the machine, under `$AIDD_USER_CONFIG_DIR`, else `$XDG_CONFIG_HOME/aidd`, else `~/.config/aidd`:

- `auth.json`, the user-level credential.
- `marketplaces.json` and `references.json`, the user-scope registry and the projects claiming it.
- `manifest.json`, what `--scope user` owns.
- `cache/built/<version>/`, one built tree per CLI version.
- Telemetry records, unless `AIDD_TELEMETRY_DIR` moves them.

The person identity file stays in the user profile and is never relocated by `AIDD_USER_CONFIG_DIR`.

Per tool, the settings file the CLI writes:

| Tool | File |
| --- | --- |
| Claude Code | `.claude/settings.json`, MCP servers in `.mcp.json` |
| Cursor | `.cursor/settings.json`, MCP servers in `.cursor/mcp.json` |
| GitHub Copilot | Plugin recommendations in `.github/copilot/settings.json`, MCP servers in `.vscode/mcp.json`, plus `.vscode/settings.json` when the VS Code tool is installed too |
| Codex | `.codex/config.toml` |
| OpenCode | `opencode.json`, or `opencode.jsonc` when that is the one present |
| VS Code | `.vscode/settings.json`, `.vscode/extensions.json`, `.vscode/keybindings.json` |

## More

- [Architecture](../docs/ARCHITECTURE.md)
- [Write a plugin](../docs/CREATE_PLUGIN.md)
- [Marketplace](../docs/MARKETPLACE.md)
- [Glossary](../docs/GLOSSARY.md)
- [FAQ](../docs/FAQ.md)
- [Contributing](../CONTRIBUTING.md)
