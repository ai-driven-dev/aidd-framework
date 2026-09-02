# AIDD CLI

The **AIDD CLI** (`@ai-driven-dev/cli`) installs AI tool runtime configs, IDE integrations, and plugins from the [AIDD marketplace](https://github.com/ai-driven-dev/framework) across AI coding assistants. Runtime configs are bundled in the CLI binary; memory and context files are provided by the `aidd-context` plugin, not the binary. Plugins are fetched from the marketplace on demand. Every installed file is hash-tracked in a manifest for drift detection.

**Supported tools:** Claude Code · Cursor · GitHub Copilot · OpenCode · Codex · VS Code (IDE integration)

---

## Prerequisites

| Prerequisite            | Version | Notes                                                   |
| ----------------------- | ------- | ------------------------------------------------------- |
| **Node.js**             | >= 22.12 | [nodejs.org](https://nodejs.org)                        |
| **git**                 | —       | Required for marketplace plugin fetching                |
| **gh CLI** _(optional)_ | —       | Can be used as an authentication method via `aidd auth login --gh` |

> **Windows:** works natively on Windows 10 1803+ (PowerShell or cmd) and on WSL.
> If you encounter permission issues with `npm install -g`, use an administrator terminal or WSL.

---

## Installation

Available on [npmjs.org](https://www.npmjs.com/package/@ai-driven-dev/cli).

### Zero-install (recommended)

Run any `aidd` command directly via `npx` — no global install needed:

```bash
npx @ai-driven-dev/cli@latest setup
npx @ai-driven-dev/cli@latest --version
```

First call fetches the package (~3 s cold start, then cached by npm). Use this when you want a one-shot run or want to pin a specific version per project (`@4.2.1`).

### Global install

For repeated use across many projects:

```bash
npm install -g @ai-driven-dev/cli@latest
# or
pnpm add -g @ai-driven-dev/cli@latest

aidd --version
```

> Run `which aidd` to identify the active binary and use the matching package manager (`npm`, `pnpm`, `yarn`, `bun`).

---

## Authentication

Authentication is **not required** for the default public marketplace (`github.com/ai-driven-dev/framework`). Authentication is only needed for private marketplaces.

To authenticate for a private marketplace:

### Method 1 — Personal Access Token (recommended)

```bash
aidd auth login --token <YOUR_TOKEN> --level user
```

### Method 2 — GitHub CLI

```bash
gh auth login
aidd auth login --gh --level user
```

### Method 3 — Environment variable

```bash
export AIDD_TOKEN=<YOUR_TOKEN>
```

### Token resolution order

`AIDD_TOKEN` env → project `.aidd/auth.json` → user `~/.config/aidd/auth.json` → `gh auth token` (only if stored config uses `method: "gh"`)

### Storage levels

| Level     | File                          | Use case                                    |
| --------- | ----------------------------- | ------------------------------------------- |
| `user`    | `~/.config/aidd/auth.json`    | Shared across all projects (default)        |
| `project` | `.aidd/auth.json`             | Per-project credential (add to `.gitignore`) |

### Auth commands

```bash
aidd auth login --token <TOKEN> --level user    # store a PAT
aidd auth login --gh --level user               # use gh CLI token
aidd auth status                                # check current auth (exit 1 if not authenticated)
aidd auth logout                                # remove stored credential
```

---

## Quickstart

```bash
# 1. Interactive setup: init manifest + register default marketplace + install runtime config
aidd setup

# 2. Non-interactive scriptable setup (CI / onboarding scripts)
aidd setup --source remote --ai claude --ide vscode --plugins recommended --yes

# 3. Install an AI tool or IDE integration (noun-first surface)
aidd ai install claude
aidd ide install vscode

# 4. Install a plugin from the marketplace
aidd plugin install aidd-context

# 5. Check installation status
aidd ai status
```

### Setup flags

```bash
# Remote marketplace (default) — optionally pin a specific tag
aidd setup --source remote --release v4.1.0 --ai claude --yes

# Local framework checkout
aidd setup --source local --path /path/to/aidd-framework --ai claude --yes

# All tools, no prompts
aidd setup --ai all --ide all --yes
```

`--source remote|local` selects the marketplace source.
`--release <tag>` pins the marketplace version fetched during setup (default: latest tag).
`--yes` accepts all defaults.

### Brownfield (existing project)

This CLI reads manifest schema v6 only. If `aidd status` (or any command) refuses to load
the manifest, run `npx @ai-driven-dev/cli@5.2.1 update --force` once — the last version able
to migrate an older manifest forward — then update the CLI again. `--force` matters: a plain
`update` skips the save when a tracked file was hand-edited.

```bash
aidd status
```

---

## User Flows

### Updating the framework

```bash
aidd status                     # see what changed (drift + available update)
aidd update                     # re-install all tool configs, update plugins, refresh marketplaces
aidd update --force             # overwrite modified files without prompting (CI-safe)
```

`aidd update` takes no scope flags — it refreshes every installed tool. To re-install a single tool, use `aidd ai update <tool>` / `aidd ide update <tool>`.

**Conflict behavior**: unmodified files (disk hash matches manifest hash) are always updated silently. Modified files prompt keep / overwrite / overwrite-all / skip-all in an interactive terminal; in non-interactive mode (no TTY, CI), the command exits 1 unless `--force` is passed. `--force` overwrites all modified files without prompting. Plugin and marketplace updates are never gated by this guard.

### Restoring modified files

```bash
aidd status                              # identify modified (~) files
aidd restore                             # restore all tracked files (all tools), prompts first
aidd restore --force                     # skip confirmation prompts (CI-safe)
aidd ai restore --tool claude            # restore a specific AI tool's files
aidd ai restore rules/naming.md          # restore specific files
```

Restore uses the version pinned in the manifest. It does not touch untracked files. Top-level `aidd restore` covers all tools; per-tool/per-file restore lives under `aidd ai restore` / `aidd ide restore`.

### Managing plugins

```bash
# Register a marketplace and install plugins
aidd marketplace add acme owner/aidd-plugins
aidd plugin install                      # no arg → interactive browse + install

# One-shot non-interactive install
aidd plugin install my-plugin --yes

# Keep plugins up to date
aidd plugin update

# Check for stale catalogs or upstream-removed plugins
aidd marketplace check
```

### Uninstalling a tool

```bash
aidd ai uninstall cursor        # remove cursor files and clean up the manifest
aidd ide uninstall vscode       # remove VS Code integration only
```

`aidd ai uninstall` / `aidd ide uninstall` take a tool argument; run once per tool to remove several.

---

## Commands

| Command                         | Description                                                                          | Key options                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `aidd auth`                     | Manage authentication (login, logout, status)                                        | `--token`, `--gh`, `--level`                                      |
| `aidd setup`                    | Bootstrap a project: init manifest + register marketplace + install runtime config   | `--source`, `--path`, `--release`, `--ai`, `--ide`, `--plugins`, `--yes` |
| `aidd ai install <tool>`        | Install an AI tool runtime configuration from bundled assets                         | `--force`                                                         |
| `aidd ai uninstall <tool>`      | Remove an AI tool's generated configuration files                                    | —                                                                 |
| `aidd ai list`                  | List installed AI tools                                                              | —                                                                 |
| `aidd ai status`                | Show drift for AI tools                                                              | —                                                                 |
| `aidd ai update [tool]`         | Re-install AI tool configs from bundled CLI assets; prompts on conflicts in TTY, exits 1 in non-TTY | `--force`                                                |
| `aidd ai restore [files...]`    | Restore AI tool tracked files to their installed version                             | `--force`, `--tool`                                               |
| `aidd ai doctor`                | Check AI tool installation health and detect issues                                  | —                                                                 |
| `aidd ide install <tool>`       | Install an IDE integration from bundled assets                                       | `--force`                                                         |
| `aidd ide uninstall <tool>`     | Remove an IDE integration from the manifest                                          | —                                                                 |
| `aidd ide list`                 | List installed IDE tools                                                             | —                                                                 |
| `aidd ide status`               | Show drift for IDE tools                                                             | —                                                                 |
| `aidd ide update [tool]`        | Re-install IDE tool configs from bundled CLI assets; prompts on conflicts in TTY, exits 1 in non-TTY | `--force`                                                |
| `aidd ide doctor`               | Check IDE tool installation health and detect issues                                 | —                                                                 |
| `aidd status`                   | Show drift across all tools (AI + IDE)                                               | —                                                                 |
| `aidd doctor`                   | Structural integrity check — exits 1 on errors or warnings                           | —                                                                 |
| `aidd restore [files...]`       | Revert modified/deleted files to the manifest-pinned version                         | `--force`, `--tool`                                               |
| `aidd plugin`                   | Manage plugins for AI tools                                                          | `create`, `remove`, `list`, `install`, `search`, `update`, `doctor` |
| `aidd marketplace`              | Manage plugin marketplaces                                                           | `add`, `list`, `remove`, `refresh`, `check`                       |
| `aidd framework build`          | Build a Claude-format framework into a tool-native plugin marketplace tree or flat workspace | `--source`, `--target`, `--out`, `--flat`, `--force`     |
| `aidd clean`                    | Remove all AIDD files — dry-run without `--force`                                    | `--force`                                                         |
| `aidd self-update`              | Update the CLI itself to the latest version                                          | `--check`, `--dry-run`, `--force`                                 |

### `aidd auth`

Manages stored GitHub credentials used to download the framework.

```bash
aidd auth login --token <TOKEN> --level user     # store a PAT at user level
aidd auth login --token <TOKEN> --level project  # store a PAT at project level
aidd auth login --gh --level user                # use gh CLI as token source
aidd auth status                                 # show current auth (exit 1 if not authenticated)
aidd auth logout                                 # remove the active credential
```

Credentials are stored in JSON files with `600` permissions. The `project` level stores in `.aidd/auth.json` — add it to `.gitignore` to avoid committing secrets.

### `aidd setup`

Bootstraps a new project: initializes the manifest, registers the default marketplace, and writes the runtime config for the selected tools. Interactive by default; scriptable with flags.

```bash
aidd setup                                              # interactive guided setup
aidd setup --source remote --ai claude --yes            # non-interactive: remote marketplace, claude
aidd setup --source remote --release v4.1.0 --ai claude --yes  # pin a specific marketplace tag
aidd setup --source local --path /path/to/framework \
  --ai claude --ide vscode --plugins recommended --yes  # local framework source
aidd setup --ai all --ide all --yes                     # all tools, no prompts
aidd setup --ai claude,cursor --ide vscode              # mix AI and IDE tools
```

| Flag | Description |
|---|---|
| `--source remote\|local` | Marketplace source. `remote` fetches from GitHub; `local` uses a local checkout. |
| `--release <tag>` | Marketplace version to fetch (e.g. `v4.1.0`). Defaults to latest tag. Remote only. |
| `--path <dir>` | Path to local framework checkout. Required with `--source local`. |
| `--ai <ids>` | Comma-separated AI tool IDs, or `all` (e.g. `claude,cursor` or `all`). |
| `--ide <ids>` | Comma-separated IDE tool IDs, or `all` (e.g. `vscode` or `all`). |
| `--plugins <mode>` | Plugin install mode: `none` \| `all` \| `recommended` \| comma-separated names. |
| `--no-default-marketplace` | Skip auto-registering `aidd-framework` (no source prompt, no plugin install). |
| `--yes` | Accept all defaults; disables interactive prompts. |

`--ai`, `--ide`, `--plugins`, or `--source` each disable interactive prompts.

### `aidd ai`

Manages AI tools (install, uninstall, list, status, update, restore, doctor).

```bash
aidd ai install claude                      # install Claude Code runtime config
aidd ai install cursor --force              # overwrite existing files
aidd ai uninstall claude                    # remove Claude Code files
aidd ai list                                # list installed AI tools
aidd ai status                             # show drift for all AI tools
aidd ai update                             # re-install all AI tool configs (prompts on conflicts)
aidd ai update claude                      # re-install a specific AI tool
aidd ai update --force                     # overwrite modified files without prompting
aidd ai restore --tool claude              # restore modified Claude files
aidd ai doctor                             # check AI tool installation health
```

### `aidd ide`

Manages IDE integrations (install, uninstall, list, status, update, doctor).

```bash
aidd ide install vscode                    # install VS Code integration
aidd ide uninstall vscode                  # remove VS Code integration
aidd ide list                              # list installed IDE tools
aidd ide status                            # show drift for IDE tools
aidd ide update                            # re-install all IDE tool configs (prompts on conflicts)
aidd ide update --force                    # overwrite modified files without prompting
aidd ide doctor                            # check IDE tool installation health
```

### `aidd status`

Compares files on disk with the manifest. Shows drift and available framework updates.

```bash
aidd status                     # drift across all tools (AI + IDE)
aidd ai status                  # AI tools only
aidd ide status                 # IDE tools only
```

Legend: `~` modified · `-` deleted · `+` untracked (on disk, not in manifest)

### `aidd doctor`

Checks structural integrity. Exits 1 if errors or warnings are found; exits 0 with a warning message if only the auth credential is missing (non-blocking in CI).

```bash
aidd doctor                     # check all tools and plugins
aidd ai doctor                  # AI tools only
aidd ide doctor                 # IDE tools only
```

Detects: missing or corrupted manifest, orphaned tool directories, broken `@path` includes and markdown links in tracked files.

> Drift (modified/deleted files) is not a structural issue — use `aidd status` for that.

### `aidd update`

Re-applies bundled configs and fetches updated plugin content. See [Updating the framework](#updating-the-framework) for examples.

> `aidd update` refreshes every installed tool. To re-install one tool, use `aidd ai update <tool>` / `aidd ide update <tool>` (these only touch tools already in the manifest). Use `aidd ai install <tool>` to add a new tool.

Per-file conflict guard: unmodified files are always updated silently. Modified files prompt in TTY or exit 1 in non-TTY. Use `--force` to overwrite all modified files without prompting. Plugin and marketplace branches are always ungated.

### `aidd restore`

Reverts modified or deleted files to the version pinned in the manifest. See [Restoring modified files](#restoring-modified-files) for examples.

### `aidd plugin`

Manages plugins for AI tools. Plugins extend the framework with additional agents, rules, hooks, and commands distributed independently of the core framework.

```bash
aidd plugin install ./path/to/plugin        # install a local plugin into all installed tools
aidd plugin install ./path/to/plugin --tool claude  # install into a specific tool only
aidd plugin install my-plugin               # install a plugin from a registered marketplace
aidd plugin install my-plugin@1.2.0         # pin to a specific version
aidd plugin install my-plugin --from acme   # resolve from a specific marketplace
aidd plugin install my-plugin --yes         # auto-resolve prompts (CI mode)
aidd plugin list                            # list installed plugins (all tools)
aidd plugin list --tool claude              # list for a specific tool
aidd plugin search hooks                    # search marketplaces by keyword
aidd plugin search hooks --recommended      # show only recommended results
aidd plugin search hooks --marketplace acme # limit search to one marketplace
aidd plugin install                         # no arg → interactively browse and install from a marketplace
aidd plugin doctor                          # check plugin installation health
aidd plugin update                          # update all installed plugins
aidd plugin update my-plugin               # update a specific plugin
aidd plugin remove my-plugin               # remove a plugin from all tools
aidd plugin remove my-plugin --tool claude  # remove from a specific tool
```

### `aidd marketplace`

Registers and manages plugin marketplaces — sources that publish plugin catalogs.

```bash
aidd marketplace add acme owner/aidd-plugins    # register a marketplace (project scope)
aidd marketplace add acme owner/aidd-plugins --user  # register at user scope
aidd marketplace add acme owner/aidd-plugins --yes   # skip trust + cleanup prompts
aidd marketplace add acme owner/aidd-plugins --overwrite  # replace existing entry
aidd marketplace list                           # list registered marketplaces
aidd marketplace list --plugins                 # also fetch + print every marketplace's plugin catalog
aidd marketplace refresh                        # refresh all marketplace catalogs
aidd marketplace refresh acme                   # refresh a specific marketplace
aidd marketplace refresh --force                # clear cache before re-fetching
aidd marketplace remove acme                    # remove a registered marketplace
aidd marketplace remove acme --yes              # skip orphan-cleanup prompt
aidd marketplace check                          # report stale marketplaces and removed plugins
```

Marketplace sources accept a GitHub shorthand (`owner/repo`) or a full path to a local catalog file. Use `--token` on `marketplace add` or `plugin install` when the source requires authentication.

#### Marketplace formats supported

The CLI can ingest plugin catalogs in five native formats and normalizes them into a common schema for installation:

| Format | Catalog probe path (how it's detected) |
|---|---|
| AIDD / Claude native | `.claude-plugin/marketplace.json` |
| Cursor | `.cursor-plugin/marketplace.json` |
| GitHub Copilot | `.github/plugin/plugin.json` |
| Codex | `.agents/plugins/marketplace.json` |
| OpenCode | `opencode.json` |

#### Per-tool settings file paths

Marketplace registration and plugin enable state are written to per-tool settings files:

| Tool | Settings file |
|---|---|
| Claude Code | `.claude/settings.json` |
| Cursor | `.cursor/settings.json` |
| GitHub Copilot | `.github/copilot/settings.json` |
| Codex | `.codex/config.json` |
| OpenCode | `opencode.json` (project root) |

> **GitHub Copilot — workspace recommendations only.** Per [VS Code docs](https://code.visualstudio.com/docs/copilot/customization/agent-plugins), `.github/copilot/settings.json` registers marketplaces as **team recommendations**, not auto-activated. On first chat in the workspace VS Code shows a notification — the user must accept it (or filter Extensions by `@agentPlugins @recommended` and enable manually) before plugins load. To skip the per-project click, add the marketplace to the user-level setting `chat.plugins.marketplaces` (application-scoped, not writable from workspace). See [End-to-end: distribute a framework to Copilot](#end-to-end-distribute-a-framework-to-copilot-marketplace) for the full flow.

### `aidd framework build`

Translates a Claude-format framework source into a **target-native distribution** — one build per tool, in one of two modes. Used by framework authors to produce the dist trees consumers install. Not a CI step; run it manually (or in your own release script) against a framework checkout, typically a tagged framework release.

```bash
aidd framework build \
  --source <framework-path> \
  --target <tool> \
  --out <dir> \
  [--flat] [--force]
```

| Flag | Required | Description |
|---|---|---|
| `--source` | yes | Path to a framework root with `plugins/<name>/.claude-plugin/plugin.json` entries |
| `--target` | yes | `claude`, `cursor`, `copilot`, `codex`, or `opencode` |
| `--out` | yes | Output directory. Marketplace mode: dist root (auto-wiped + recreated). Flat mode: the project root to materialize into |
| `--flat` | no | Materialize directly into a project workspace, bypassing the marketplace layer |
| `--force` | no | Overwrite existing files at canonical paths. **Flat mode only** (rejected without `--flat`) |

#### Two modes

- **Marketplace** (default) — emits a self-contained marketplace tree (`marketplace.json` + `plugins/<name>/...`). The consumer registers it with `aidd marketplace add` and installs plugins through the tool's native marketplace flow. Paths are rewritten to the tool's plugin-root token; no `${CLAUDE_PLUGIN_ROOT}` survives unless that token is the tool's own.
- **Flat** (`--flat`) — materializes plugin content directly under the tool's workspace config directory (e.g. `.claude/`, `.cursor/`), with no marketplace indirection. For tools without native marketplace support, or when you want files on disk in the project.

#### Per-tool / per-mode matrix

`opencode` is **flat-only** (no native marketplace). The other four support both modes.

| Target | Marketplace layout (`<out>/`) | Plugin-root token | Flat layout (`<project>/`) |
|---|---|---|---|
| `claude` | `.claude-plugin/marketplace.json` · `plugins/<n>/.claude-plugin/plugin.json` · `agents/*.md` | `${CLAUDE_PLUGIN_ROOT}` | `.claude/` (+ `.mcp.json`); hooks merged into `.claude/settings.json` |
| `cursor` | `.cursor-plugin/marketplace.json` · `plugins/<n>/.cursor-plugin/plugin.json` · `agents/*.md` | `${CURSOR_PLUGIN_ROOT}` | `.cursor/` |
| `copilot` | `.plugin/marketplace.json` · `plugins/<n>/.plugin/plugin.json` (OpenPlugin spec) · `agents/*.md` | `${PLUGIN_ROOT}` | `.github/` (+ `.vscode/`) |
| `codex` | `.claude-plugin/marketplace.json` · `plugins/<n>/.codex-plugin/plugin.json` · `codex-agents/*.toml` | `${PLUGIN_ROOT}` | `.codex/` |
| `opencode` | — (flat-only) | — | `.opencode/` (+ `opencode.json` for MCP) |

Copilot uses the [OpenPlugin spec](https://github.com/vercel/open-plugin-spec) (`.plugin/plugin.json`, `${PLUGIN_ROOT}`) — the only layout where Copilot's editor + CLI resolve the plugin-root token at runtime. Codex requires the manifest `skills` field as a **string** (`"./skills"`), and project subagents (`.codex/agents/*.toml`) load only when the project is **trusted**.

#### End-to-end: distribute a framework to Copilot (marketplace)

```bash
# 1. (author, per release) — produce the dist tree
aidd framework build --source ./framework --target copilot --out ./dist/aidd-framework-copilot

# 2. (consumer) — register and install
aidd ai install copilot
aidd marketplace add aidd-fw ./dist/aidd-framework-copilot --yes
aidd plugin install aidd-dev --tool copilot --yes
```

After step 2 the CLI writes `.github/copilot/settings.json` with `extraKnownMarketplaces` + `enabledPlugins`. **VS Code shows a workspace recommendation notification on first chat**; the consumer accepts it once for plugins to surface in the slash menu.

To skip the per-project notification, add the dist path to the user-level `chat.plugins.marketplaces` setting via VS Code Settings UI (search "chat plugins marketplaces"):

```jsonc
// ~/Library/Application Support/Code/User/settings.json (macOS)
// %APPDATA%\Code\User\settings.json (Windows)
// ~/.config/Code/User/settings.json (Linux)
{
  "chat.plugins.marketplaces": [
    "file:///absolute/path/to/dist/aidd-framework-copilot"
  ]
}
```

The CLI cannot write this setting programmatically (VS Code enforces application scope on it).

#### Flat materialization (e.g. opencode)

```bash
# Materialize the framework straight into a project workspace
aidd framework build --source ./framework --target opencode --out ./my-project --flat
# Re-run after source changes, overwriting canonical paths:
aidd framework build --source ./framework --target opencode --out ./my-project --flat --force
```

Flat mode writes directly under the project's tool directory — no `aidd marketplace add` / `aidd plugin install` step. opencode hooks are skipped (its runtime is JS modules, not declarative `hooks.json`).

#### Build every target for a release

```bash
for t in claude cursor copilot codex; do
  aidd framework build --source ./framework --target "$t" --out "./dist/aidd-framework-$t"
done
aidd framework build --source ./framework --target opencode --out ./dist/aidd-framework-opencode-flat --flat
```

### Manifest schema upgrades

There is no `aidd migrate` command, and no automatic migration: this CLI reads manifest schema v6 only. A manifest below v6 is refused with a message naming the last CLI able to migrate it — `npx @ai-driven-dev/cli@5.2.1 update --force` — run once to upgrade the manifest on disk, then update the CLI again. A manifest above v6 (written by a newer CLI) is refused with a message pointing at `aidd self-update` instead.

### `aidd clean`

Removes all AIDD-generated files and the manifest.

```bash
aidd clean                      # dry-run: shows what will be removed
aidd clean --force              # actual removal
```

### `aidd self-update`

Updates the CLI itself to the latest published version.

```bash
aidd self-update                # install latest version
aidd self-update --check        # check availability without installing
aidd self-update --dry-run      # preview without installing
aidd self-update --force        # reinstall even if already up to date
```

---

## Options

### Global (all commands)

```bash
aidd update --verbose           # detailed logs
```

**Environment variables:**

| Variable       | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `AIDD_TOKEN`   | GitHub token — takes precedence over stored credentials (needed for private marketplaces only) |
| `AIDD_VERBOSE` | Verbose mode (`true`/`false`)                                           |

---

## Removed surface (v4.0.x → v4.1.0)

The following commands and flags were removed in v4.1.0. Do not use them in new scripts.

| Removed | Replacement |
|---|---|
| `aidd install ai <tool>` | `aidd ai install <tool>` |
| `aidd install ide <tool>` | `aidd ide install <tool>` |
| `aidd uninstall ai <tool>` | `aidd ai uninstall <tool>` |
| `aidd uninstall ide <tool>` | `aidd ide uninstall <tool>` |
| `aidd cache list` | removed — caches are internal; inspect via `aidd marketplace list` |
| `aidd cache clear` | `aidd marketplace refresh --force` (clears cache before re-fetch) |
| `aidd config list\|get\|set` | removed — manifest fields `docsDir`/`repo` dropped |
| `aidd sync` / `aidd ai sync` | removed — install rebuilds each tool from the marketplace; re-install to refresh |
| `aidd restore <tool> [file]` (tool/file args) | `aidd ai restore [files...] --tool <tool>` (top-level `aidd restore` still exists, force-only, all tools) |
| `--repo` global flag | `aidd marketplace add` |
| `--mode` on setup/install | `--source local\|remote` on `aidd setup` |
| `--path` on install | `aidd setup --source local --path <dir>` |
| `--release`, `--from`, `--switch-mode` on install | removed — tarball download eliminated |
| `--docs-dir` on setup | removed — `docsDir` field dropped from manifest v5 |

See [MIGRATION.md](MIGRATION.md) for the full migration guide from v4.0.x to v4.1.0.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution guide.

Code contributions are open to certified **Obsidian+** members.

---

## License

Private repository — all AIDD team members.

---

← [Back to aidd-framework](https://github.com/ai-driven-dev/framework)
