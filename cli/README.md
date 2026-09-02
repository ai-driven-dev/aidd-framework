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

# 3. Install an AI tool or IDE integration
aidd framework install --tool claude
aidd framework install --tool vscode

# 4. Install a plugin from the marketplace
aidd plugin install aidd-context

# 5. Check installation health, inventory, and drift
aidd doctor
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

This CLI reads manifest schema v6 only. If `aidd doctor` (or any command) refuses to load
the manifest, run `npx @ai-driven-dev/cli@5.2.1 update --force` once — the last version able
to migrate an older manifest forward — then update the CLI again. `--force` matters: a plain
`update` skips the save when a tracked file was hand-edited.

```bash
aidd doctor
```

---

## User Flows

### Updating the framework

```bash
aidd doctor                     # see what changed (drift + inventory + health)
aidd framework update           # re-install all tool configs (all installed tools)
aidd framework update --force   # overwrite modified files without prompting (CI-safe)
aidd plugin update               # keep plugins up to date
aidd marketplace refresh         # re-fetch marketplace catalogs
```

`aidd framework update` with no `--tool` refreshes every installed tool. To re-install a single tool, use `aidd framework update --tool <tool>`. This is distinct from bare `aidd update`, which updates the CLI binary itself (see [`aidd update`](#aidd-update)).

**Conflict behavior**: unmodified files (disk hash matches manifest hash) are always updated silently. Modified files prompt keep / overwrite / overwrite-all / skip-all in an interactive terminal; in non-interactive mode (no TTY, CI), the command exits 1 unless `--force` is passed. `--force` overwrites all modified files without prompting.

### Restoring modified files

```bash
aidd doctor                              # identify modified (~) files, in the Drift section
aidd sync                                # restore all tracked files (all tools), prompts first
aidd sync --force                        # skip confirmation prompts (CI-safe)
aidd sync --tool claude                  # restore a specific tool's files
aidd sync rules/naming.md                # restore specific files
```

Sync (renamed from `restore`) rewrites owned files from what is already there, using the version pinned in the manifest. It does not touch untracked files. Bare `aidd sync` covers all tools; `--tool`/`--plugin` narrow it to one.

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
aidd framework remove --tool cursor        # remove cursor files and clean up the manifest
aidd framework remove --tool vscode        # remove VS Code integration only
```

`aidd framework remove --tool <tool>` takes one tool per invocation; run once per tool to remove several. This removes the framework's files for that tool only — see [`aidd clean`](#aidd-clean) to remove all of AIDD from the project.

---

## Commands

| Command                          | Description                                                                          | Key options                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `aidd auth`                       | Manage authentication (login, logout, status)                                        | `--token`, `--gh`, `--level`                                      |
| `aidd setup`                      | Bootstrap a project: init manifest + register marketplace + install runtime config   | `--source`, `--path`, `--release`, `--ai`, `--ide`, `--plugins`, `--yes` |
| `aidd doctor`                     | Detected/equipped tools, plugins, drift, and problems — across all tools or one      | `--tool`, `--plugin`                                              |
| `aidd sync [files...]`            | Rewrite owned files from what is already there, driven by the manifest               | `--force`, `--tool`, `--plugin`                                   |
| `aidd translate <source>`         | Convert an arbitrary source into a target-native plugin tree — records nothing       | `--to`, `--out`, `--as`, `--force`                                |
| `aidd update` (alias `upgrade`)   | Update the CLI itself to the latest version                                          | `--check`, `--dry-run`, `--force`                                 |
| `aidd clean`                      | Remove all AIDD files — dry-run without `--force`                                    | `--force`                                                         |
| `aidd framework install`          | Install a tool's runtime configuration from bundled assets                           | `--tool`, `--force`, `--no-plugins`                               |
| `aidd framework update`           | Re-install tool configs from bundled CLI assets (all installed tools if `--tool` is omitted) | `--tool`, `--force`                                        |
| `aidd framework remove`           | Remove a tool's generated configuration files                                        | `--tool`                                                          |
| `aidd plugin`                     | Manage plugins for AI tools                                                          | `remove`, `list`, `install`, `search`, `update`                   |
| `aidd marketplace`                | Manage plugin marketplaces                                                           | `add`, `list`, `remove`, `refresh`, `check`                       |

`--tool` is the single scope flag across `doctor`, `sync`, and every `framework`/`plugin` subcommand — it takes one AI or IDE tool ID (`claude`, `cursor`, `copilot`, `codex`, `opencode`, `vscode`); omit it to act on every installed tool.

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

### `aidd framework`

Manages the framework's lifecycle on installed tools — install, update, remove — scoped
by `--tool` to one AI or IDE tool ID. Acts on the framework alone; see [`aidd setup`](#aidd-setup)
to bootstrap the whole project instead.

```bash
aidd framework install --tool claude              # install Claude Code runtime config
aidd framework install --tool cursor --force      # overwrite existing files
aidd framework remove --tool claude               # remove Claude Code files
aidd framework install --tool vscode              # install VS Code integration
aidd framework remove --tool vscode               # remove VS Code integration
aidd framework update                             # re-install all installed tools' configs (prompts on conflicts)
aidd framework update --tool claude                # re-install a specific tool
aidd framework update --force                     # overwrite modified files without prompting
```

Per-file conflict guard on `update`: unmodified files are always updated silently. Modified
files prompt in TTY or exit 1 in non-TTY. Use `--force` to overwrite all modified files
without prompting. This moves installed tools to a new version — see
[`aidd marketplace refresh`](#aidd-marketplace) to re-fetch catalogs instead.

### `aidd doctor`

Detected and equipped tools, plugins, drift, and problems — in one report, across all
tools or one. Absorbs what used to be split across `status`, `ai status`, `ide status`,
`ai doctor`, `ide doctor`, and `plugin doctor`. Structural issues (missing/corrupted
manifest, orphaned tool directories, broken `@path` includes and markdown links) exit 1;
drift (modified/deleted files, shown in the Drift section) never gates the exit code —
only real issues do.

```bash
aidd doctor                     # inventory + drift + health, across every installed tool
aidd doctor --tool claude       # scoped to one tool
aidd doctor --plugin my-plugin  # scoped to one plugin (exit code reflects that plugin only)
```

Legend for the drift section: `~` modified · `-` deleted · `+` untracked (on disk, not in manifest)

### `aidd sync`

Rewrites owned files from what is already there — regenerates tracked files, driven by
the manifest. Renamed from `restore`. Uses the version pinned in the manifest; does not
touch untracked files. See [`aidd translate`](#aidd-translate) for the unrecorded version
of the same conversion.

```bash
aidd sync                                # restore all tracked files (all tools), prompts first
aidd sync --force                        # skip confirmation prompts (CI-safe)
aidd sync --tool claude                  # restore a specific tool's files
aidd sync rules/naming.md                # restore specific files
```

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
aidd doctor --plugin my-plugin              # check one plugin's installation health
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

### `aidd translate`

Converts an arbitrary source into a **target-native distribution** — one build per tool, in one of two modes — and records nothing (see [`aidd sync`](#aidd-sync) for the manifest-driven, tracked version of the same conversion). Renamed from `framework build`. Used by framework authors to produce the dist trees consumers install. Not a CI step; run it manually (or in your own release script) against a framework checkout, typically a tagged framework release.

```bash
aidd translate <framework-path> \
  --to <tool> \
  --out <dir> \
  [--as marketplace|flat] [--force]
```

| Flag | Required | Description |
|---|---|---|
| `<source>` | yes | Path to a framework root with `plugins/<name>/.claude-plugin/plugin.json` entries |
| `--to` | yes | `claude`, `cursor`, `copilot`, `codex`, or `opencode` |
| `--out` | yes | Output directory. Marketplace mode: dist root (auto-wiped + recreated). Flat mode: the project root to materialize into |
| `--as marketplace\|flat` | no | Output layout; defaults to `marketplace`. `flat` materializes directly into a project workspace, bypassing the marketplace layer |
| `--force` | no | Overwrite existing files at canonical paths. **Flat mode only** (rejected without `--as flat`) |

#### Two modes

- **Marketplace** (default) — emits a self-contained marketplace tree (`marketplace.json` + `plugins/<name>/...`). The consumer registers it with `aidd marketplace add` and installs plugins through the tool's native marketplace flow. Paths are rewritten to the tool's plugin-root token; no `${CLAUDE_PLUGIN_ROOT}` survives unless that token is the tool's own.
- **Flat** (`--as flat`) — materializes plugin content directly under the tool's workspace config directory (e.g. `.claude/`, `.cursor/`), with no marketplace indirection. For tools without native marketplace support, or when you want files on disk in the project.

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
aidd translate ./framework --to copilot --out ./dist/aidd-framework-copilot

# 2. (consumer) — register and install
aidd framework install --tool copilot
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
aidd translate ./framework --to opencode --out ./my-project --as flat
# Re-run after source changes, overwriting canonical paths:
aidd translate ./framework --to opencode --out ./my-project --as flat --force
```

Flat mode writes directly under the project's tool directory — no `aidd marketplace add` / `aidd plugin install` step. opencode hooks are skipped (its runtime is JS modules, not declarative `hooks.json`).

#### Build every target for a release

```bash
for t in claude cursor copilot codex; do
  aidd translate ./framework --to "$t" --out "./dist/aidd-framework-$t"
done
aidd translate ./framework --to opencode --out ./dist/aidd-framework-opencode-flat --as flat
```

### Manifest schema upgrades

There is no `aidd migrate` command, and no automatic migration: this CLI reads manifest schema v6 only. A manifest below v6 is refused with a message naming the last CLI able to migrate it — `npx @ai-driven-dev/cli@5.2.1 update --force` — run once to upgrade the manifest on disk, then update the CLI again. A manifest above v6 (written by a newer CLI) is refused with a message pointing at `aidd update` instead.

### `aidd clean`

Removes all AIDD-generated files and the manifest — retires every part of AIDD from the
project. See [`aidd framework remove`](#aidd-framework) to remove one tool's framework
files only.

```bash
aidd clean                      # dry-run: shows what will be removed
aidd clean --force              # actual removal
```

### `aidd update`

A bare verb with no subject means "the CLI itself" — same convention Claude Code and
Codex use. Updates the CLI binary to the latest published version. Renamed from
`self-update`; `upgrade` is an alias. Distinct from [`aidd framework update`](#aidd-framework),
which updates installed tools' configs within a project.

```bash
aidd update                     # install latest version
aidd update --check             # check availability without installing
aidd update --dry-run           # preview without installing
aidd update --force             # reinstall even if already up to date
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
| `aidd sync` / `aidd ai sync` (v4.0.x meaning) | removed at the time — install rebuilds each tool from the marketplace; re-install to refresh. `aidd sync` returned in a later pass with a different meaning — see the surface-unification table below |
| `aidd restore <tool> [file]` (tool/file args) | `aidd ai restore [files...] --tool <tool>` (v4.1.0; `ai restore` itself later folded into `aidd sync --tool` — see below) |
| `--repo` global flag | `aidd marketplace add` |
| `--mode` on setup/install | `--source local\|remote` on `aidd setup` |
| `--path` on install | `aidd setup --source local --path <dir>` |
| `--release`, `--from`, `--switch-mode` on install | removed — tarball download eliminated |
| `--docs-dir` on setup | removed — `docsDir` field dropped from manifest v5 |

See [MIGRATION.md](MIGRATION.md) for the full migration guide from v4.0.x to v4.1.0.

## Removed surface (command grammar unification)

A later pass unified the surface around one grammar: a bare verb performs an action now;
a noun then a verb manages a resource's lifecycle. `ai`/`ide` were not a managed resource —
they were the scope dimension, folded into `--tool`.

| Removed | Replacement |
|---|---|
| `aidd ai <verb>` / `aidd ide <verb>` | `--tool <id>` on `doctor`, `sync`, and `framework install\|update\|remove` |
| `aidd status`, `aidd ai status`, `aidd ide status` | `aidd doctor` (gained the drift report `status` carried) |
| `aidd ai doctor`, `aidd ide doctor`, `aidd plugin doctor` | `aidd doctor --tool <id>` / `aidd doctor --plugin <name>` |
| `aidd restore`, `aidd ai restore`, `aidd ide restore` | `aidd sync` (same command, renamed) |
| `aidd self-update` | `aidd update` (bare verb, no subject, means the CLI itself) |
| `aidd framework build` | `aidd translate <source> --to <target>` (same command, renamed) |
| `aidd plugin create` | removed — never documented, never implemented |

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution guide.

Code contributions are open to certified **Obsidian+** members.

---

## License

Private repository — all AIDD team members.

---

← [Back to aidd-framework](https://github.com/ai-driven-dev/framework)
