# AIDD CLI — E2E Test Map

> Base for local real-environment E2E testing. Each row = one test scenario.
> Status: `✅ covered` | `⬜ missing` | `❌ known-broken`

---

## Expected output by tool

Reference for what files must exist on disk after install + plugin install. Use these trees to assert correctness.

---

### Capability support matrix

| Capability | Claude | Cursor | Copilot | Opencode | Codex | VSCode |
|-----------|:------:|:------:|:-------:|:--------:|:-----:|:------:|
| Agents | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Skills | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Commands | ✓ | ✓ | ✓ | ✓ | — | — |
| Rules | ✓ | ✓ | ✓ | ✓ | — | — |
| MCP | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Hooks | — | ✓ | — | — | ✓ | — |
| Settings | — | — | ✓ | — | — | ✓ |
| Plugins | ✓ | ✓ | ✓ | ✓ (flat) | ✓ | — |

---

### Claude

**Base install** (`install ai claude --no-plugins`):

```
.aidd/
  manifest.json
  marketplaces.json
.claude/
  settings.json                        ← marketplace settings (extraKnownMarketplaces, enabledPlugins)
CLAUDE.md                              ← memory file at project root
.gitignore
aidd_docs/
  README.md
  CATALOG.md
  CONTRIBUTING.md
  memory/
  tasks/
```

**After `plugin install aidd-context --tool claude`:**

```
.claude/plugins/aidd-context/
  plugin.json                          ← plugin manifest at plugin root
  hooks/
    hooks.json                         ← SessionStart hook
    update_memory.js                   ← companion script
  skills/
    02-project-init/SKILL.md + actions/ + assets/
    03-architecture-generate/SKILL.md + actions/
    04-context-generate/SKILL.md + actions/ + assets/ + evals/ + references/ + scripts/
    05-brainstorm/SKILL.md + actions/
    06-challenge/SKILL.md + actions/
    07-mermaid/SKILL.md + actions/ + references/
    08-learn/SKILL.md + actions/ + assets/
    09-discovery/SKILL.md + actions/
```

**After `plugin install aidd-dev --tool claude`:**

```
.claude/plugins/aidd-dev/
  plugin.json                          ← plugin manifest at plugin root
  .mcp.json                            ← Claude MCP format (mcpServers: {})
  agents/
    alexia.md
    claire.md
    iris.md
    kent.md
    martin.md
  skills/
    00-sdlc/SKILL.md + actions/
    01-plan/SKILL.md + actions/ + assets/
    02-assert/SKILL.md + actions/
    03-audit/SKILL.md + actions/
    04-review/SKILL.md + actions/ + assets/
    05-test/SKILL.md + actions/
    06-refactor/SKILL.md + actions/
    07-debug/SKILL.md + actions/
    08-for-sure/SKILL.md + actions/ + assets/
```

**After `plugin install aidd-vcs --tool claude`:**

```
.claude/plugins/aidd-vcs/
  plugin.json                          ← plugin manifest at plugin root
  skills/
    01-commit/SKILL.md + actions/ + assets/
    02-pull-request/SKILL.md + actions/ + assets/
    03-release-tag/SKILL.md + actions/ + assets/
    04-issue-create/SKILL.md + actions/ + assets/
```

**Key assertions:**
- Plugin dir: `.claude/plugins/<name>/`
- Plugin manifest: `plugin.json` at root of plugin dir (not in a subdirectory)
- MCP file: `.mcp.json` (root of plugin dir, NOT project root)
- Hooks: `hooks/hooks.json` + any `hooks/*.js` companion scripts
- Skills: numeric prefix dirs `NN-name/` (e.g. `00-sdlc/`, `01-plan/`)
- Agents: `.md` files directly in `agents/`

---

### Cursor

**Base install** (`install ai cursor --no-plugins`):

```
.cursor/
  rules/
    00-architecture/.gitkeep
    01-standards/.gitkeep
    ...
    04-tooling/ide-mapping.mdc         ← .mdc extension (not .md)
    ...
.gitignore
aidd_docs/
```

**After `plugin install aidd-dev --tool cursor`:**

```
.cursor/plugins/aidd-dev/
  plugin.json                          ← cursor plugin manifest at plugin root
  mcp.json                             ← cursor MCP format (NOT .mcp.json)
  agents/
    alexia.md
    claire.md
    iris.md
    kent.md
    martin.md
  skills/
    00-sdlc/SKILL.md + ...
    ...
```

**After `plugin install aidd-context --tool cursor`:**

```
.cursor/plugins/aidd-context/
  plugin.json
  hooks/
    hooks.json                         ← cursor DOES support hooks
    update_memory.js
  skills/
    02-project-init/...
    ...
```

**Key assertions vs Claude:**
- Plugin dir: `.cursor/plugins/<name>/` (not `.claude/plugins/`)
- Plugin manifest: `plugin.json` at root of plugin dir
- MCP: `mcp.json` (no leading dot, different from Claude's `.mcp.json`)
- Rules: `.mdc` extension instead of `.md`
- Hooks: supported, same structure as Claude

---

### Copilot

**Base install** (`install ai copilot --no-plugins`):

```
.github/
  instructions/
    04-tooling-ide-mapping.instructions.md   ← flattened, .instructions.md ext
.vscode/
  settings.json                              ← IDE settings
.gitignore
aidd_docs/
```

**After `plugin install aidd-dev --tool copilot`:**

```
.github/plugins/aidd-dev/
  plugin.json                                ← flat, no subdirectory prefix
  agents/
    alexia.agent.md                          ← .agent.md extension
    claire.agent.md
    ...
  prompts/                                   ← commands become prompts
    ...
  instructions/                              ← rules become instructions
    ...
  skills/
    ...
```

**Key assertions vs Claude:**
- Plugin manifest: `plugin.json` (no `.github-plugin/` dir — flat)
- MCP: `.vscode/mcp.json` (shared with VSCode)
- Rules: `.instructions.md` extension, filenames flattened (`/` → `-`)
- Agents: `.agent.md` extension
- Commands → `prompts/` directory with `.prompt.md` extension
- Settings: `.vscode/settings.json` populated

---

### Opencode

**Base install** (`install ai opencode --no-plugins`):

```
opencode.json                                ← or opencode.jsonc if already exists
.gitignore
aidd_docs/
```

**After `plugin install aidd-dev --tool opencode`:**

```
opencode.json                                ← MCP merged here (mcpServers section)
.opencode/plugins/aidd-dev/
  agents/alexia.md ...
  skills/[2.0] sdlc/...
```

**Key assertions vs Claude:**
- No hooks support — `hooks/` files in plugin are silently skipped
- MCP: merged into `opencode.json` at project root (not a separate file)
- Plugin mode: flat namespace — skills prefixed with `aidd-<plugin>:` internally
- No `.opencode-plugin/` manifest dir

---

### Codex

**Base install** (`install ai codex --no-plugins`):

```
.codex/
  hooks.json                                 ← codex hook format
.gitignore
aidd_docs/
```

**After `plugin install aidd-dev --tool codex`:**

```
.codex/plugins/aidd-dev/
  plugin.json
  config.toml                                ← TOML MCP format (mcp_servers = [])
  agents/
    alexia.codex.md                          ← TOML frontmatter format
    ...
  skills/
    00-sdlc/SKILL.md + ...
```

**Key assertions vs Claude:**
- No rules, no commands support — those sections in plugin are skipped
- MCP: `config.toml` with `mcp_servers` array (TOML, not JSON)
- Agents: TOML-formatted content
- Hooks: `.codex/hooks.json` (project-level, merged — not in plugin dir)
- Plugin manifest: `plugin.json` at root of plugin dir

---

### VSCode (IDE)

**Base install** (`install ide vscode --no-plugins`):

```
.vscode/
  extensions.json
  keybindings.json
  settings.json
.gitignore
aidd_docs/
```

**Key assertions:**
- No agents, skills, commands, rules, MCP, hooks
- No plugin support
- 3 files only: extensions, keybindings, settings

---

### Cross-tool translation: from Claude plugin to Cursor

When the same plugin (`aidd-dev`) is installed for both claude and cursor, the translator maps:

| Source file in plugin | Claude output | Cursor output |
|----------------------|---------------|---------------|
| `agents/martin.md` | `.claude/plugins/aidd-dev/agents/martin.md` | `.cursor/plugins/aidd-dev/agents/martin.md` |
| `.mcp.json` | `.claude/plugins/aidd-dev/.mcp.json` | `.cursor/plugins/aidd-dev/mcp.json` |
| `hooks/hooks.json` | ❌ skipped (claude no hooks) | `.cursor/plugins/aidd-dev/hooks/hooks.json` (cursor format: camelCase events) |
| `hooks/update_memory.js` | ❌ skipped | `.cursor/plugins/aidd-dev/hooks/update_memory.js` |
| `skills/00-sdlc/SKILL.md` | `.claude/plugins/aidd-dev/skills/00-sdlc/SKILL.md` | `.cursor/plugins/aidd-dev/skills/00-sdlc/SKILL.md` |
| `plugin.json` | `.claude/plugins/aidd-dev/plugin.json` | `.cursor/plugins/aidd-dev/plugin.json` |

---

## Global Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--verbose` | boolean | false | Enables detailed output on all commands |
| `--repo <owner/repo>` | string | — | Override GitHub repo for framework resolution |
| `-V, --version` | — | — | Print version and exit |

### Global test cases

| # | Scenario | Expected |
|---|----------|----------|
| G1 | `aidd --version` | Prints semver, exit 0 |
| G2 | `aidd --verbose install ai claude --path <fw>` | Shows detailed file-level output |
| G3 | `aidd --repo owner/repo install ai claude --release v3.9.0` | Uses specified repo for GitHub resolution |

---

## `aidd setup`

Sets up or updates the project. Smart dispatcher: detects state and calls init/install/update/adopt. Runtime configs + memory stubs come from bundled CLI assets — no framework download.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--path <path>` | string | — | Local framework dir (only used by `--mode local` for plugin copy) |
| `--release <tag>` | string | — | Marketplace catalog version to install (e.g., `v4.1.0-beta.2`) |
| `--ai <ids>` | string | — | Comma-separated AI tool IDs |
| `--ide <ids>` | string | — | Comma-separated IDE tool IDs |
| `--all` | boolean | false | All available tools (AI + IDE) |
| `--from <version>` | string | — | Version already installed (required for adopt flow) |
| `--mode <mode>` | string | `local` | Distribution mode: `local` or `remote` |
| `--switch-mode` | boolean | false | Switch distribution mode on existing project |

> **Note**: `--docs-dir` was removed (locked decision #10: docs dir hardcoded to `aidd_docs`).
> **Note**: Setup no longer downloads framework tarball. Asset-based install + marketplace catalog only.

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Fresh project + `--path <fw> --ai claude` | Init + install claude (assets), manifest created |
| S2 | Fresh project + `--all --path <fw>` | Installs all AI + IDE tools (assets) |
| S4 | `--release <tag>` in remote mode | Sets marketplace catalog version, no GitHub auth required |
| S5 | `--from v3.0.0 --path <fw> --ai claude` with adopt signals | Adopt flow — registers existing install in manifest |
| S6 | missing `--source`, no `--path` | Error: `--source` required, exit 1 |
| S7 | `--mode local --path <fw> --ai claude` | Init + install + `./plugins/` + `./.claude-plugin/` copied to project root, manifest mode = local |
| S8 | `--mode remote --ai claude` | Init + install, no `./plugins/` in project root, manifest mode = remote, no tarball |
| S9 | Already-init local project + `--switch-mode --mode remote` | Mode switched, exit 0, manifest mode = remote |
| S10 | `--mode invalid --path <fw> --ai claude` | Error: invalid mode value, exit 1 |
| S11 | `--mode remote --release v4.1.0-beta.2 --ai claude` (no auth) | Succeeds: marketplace flow, no GitHub API call |

---

## `aidd install`

Generates tool-specific distributions from the framework.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `[category]` | positional | — | `ai` or `ide` |
| `[tool...]` | positional | — | Tool IDs: `claude`, `cursor`, `copilot`, `opencode`, `codex`, `vscode` |
| `-f, --force` | boolean | false | Overwrite already-installed tool |
| `-a, --all` | boolean | false | Install all available tools |
| `--path <path>` | string | — | Local framework dir (legacy framework-fetch path) |
| `--release <tag>` | string | — | Marketplace catalog version (legacy framework-fetch path) |
| `--mcp <servers>` | string | — | Comma-separated MCP server names to install |
| `--plugins <names>` | string | — | Comma-separated plugin names from catalog |
| `--all-plugins` | boolean | false | Install all catalog plugins |
| `--recommended-plugins` | boolean | false | Install recommended plugins only |
| `--no-plugins` | boolean | false | Skip plugin installation |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| I1 | `install ai claude --path <fw>` | 10 claude files, manifest updated |
| I2 | `install ai cursor --path <fw>` | 10 cursor files in `.cursor/rules/` |
| I3 | `install ai copilot --path <fw>` | Copilot files installed |
| I4 | `install ai opencode --path <fw>` | `opencode.json` (or `.jsonc`) created |
| I5 | `install ai codex --path <fw>` | Codex hooks installed |
| I6 | `install ide vscode --path <fw>` | VSCode settings/keybindings/extensions installed |
| I7 | `install --all --path <fw>` | All 6 tools installed |
| I8 | `install ai claude --path <fw>` twice (no `--force`) | Error: already installed |
| I9 | `install ai claude --path <fw> --force` | Reinstalls, overwrites existing |
| I10 | `install ai claude --path <fw> --no-plugins` | Installs without plugins, no marketplace registered |
| I11 | `install ai claude --path <fw> --recommended-plugins` | Installs + recommended plugins from catalog |
| I12 | `install ai claude --path <fw> --mcp playwright` | Only playwright MCP installed |
| I13 | `install ai claude --path <fw> --plugins aidd-dev` | Specific plugin installed alongside |
| I14 | `install ai claude --path <fw> --all-plugins` | All catalog plugins installed |
| I15 | `install ai claude` (no `--path`, no `--release`, no manifest) | Fetches latest from default public GitHub repo (no auth needed for public repos) |
| I16 | `install ai claude --release v3.9.0` (no auth) | Error: authentication required |
| I17 | `install ai claude --plugins x --all-plugins` | Error: mutually exclusive flags |

---

## `aidd uninstall`

Removes tool configuration files.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `[category]` | positional | — | `ai` or `ide` |
| `[tool...]` | positional | — | Tool IDs |
| `-a, --all` | boolean | false | Uninstall all installed tools |
| `--mcp <servers>` | string | — | Remove specific MCP server entries |
| `--plugin <name>` | string | — | Remove a specific plugin |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| U1 | `uninstall ai claude` | Removes claude files, manifest updated |
| U2 | `uninstall --all` | Removes all tools |
| U3 | `uninstall ai claude --plugin aidd-dev` | Only plugin removed, base claude kept |
| U4 | `uninstall ai claude --mcp playwright` | Only playwright MCP entry removed |
| U5 | `uninstall ai claude` (not installed) | Error: not installed |
| U6 | `uninstall` (no args, interactive) | Prompts tool selection |

---

## `aidd update`

Updates installed files to latest framework version.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `-f, --force` | boolean | false | Overwrite conflicting files |
| `--dry-run` | boolean | false | Preview without writing |
| `--tool <tool>` | string | — | Limit to one tool |
| `--path <path>` | string | — | Local framework dir (legacy framework-fetch path) |
| `--release <tag>` | string | — | Marketplace catalog version (legacy framework-fetch path) |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| UP1 | `update --path <fw>` (nothing changed) | "All files up to date" |
| UP2 | `update --path <fw2>` (newer framework) | Changed files updated, new files added |
| UP3 | `update --dry-run --path <fw2>` | Shows diff, no writes |
| UP4 | `update --tool claude --path <fw2>` | Only claude updated |
| UP5 | Modified user file conflicts with update | Prompts to overwrite or skip |
| UP6 | Modified user file + `--force` | Overwrites without prompt |
| UP7 | `update --release v3.9.0` (no auth) | Error: authentication required |

---

## `aidd restore`

Restores files to their framework version (undoes user modifications).

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `[files...]` | positional | — | Specific relative file paths |
| `-f, --force` | boolean | false | No prompt |
| `--tool <tool>` | string | — | Limit to one tool |
| `--path <path>` | string | — | Local framework dir (legacy framework-fetch path) |
| `--release <tag>` | string | — | Marketplace catalog version (legacy framework-fetch path) |
| `--plugin <name>` | string | — | Restore specific plugin |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| R1 | `restore` (nothing modified) | "Nothing to restore" |
| R2 | Modified tracked file → `restore` | File reverted, hash re-matched |
| R3 | Deleted tracked file → `restore` | File recreated |
| R4 | `restore .claude/rules/04-tooling/ide-mapping.md` | Only that file restored |
| R5 | `restore --tool claude` | Only claude files checked |
| R6 | `restore --plugin aidd-dev` | Plugin files re-fetched and written |
| R7 | `restore` in non-interactive mode (no `--force`) | Error: use `--force` |
| R8 | `restore --path <fw>` (same version) | Restores from local path |

---

## `aidd status`

Shows drift between disk and manifest.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `[category]` | positional | — | `ai` or `ide` |
| `--plugin <name>` | string | — | Filter to one plugin |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| ST1 | `status` (clean install) | "All files are in sync" |
| ST2 | Modified tracked file → `status` | Shows file as modified |
| ST3 | Deleted tracked file → `status` | Shows file as missing |
| ST4 | User-added file → `status` | Not shown (not tracked) |
| ST5 | `status ai` | Only AI tool files shown |
| ST6 | `status ide` | Only IDE tool files shown |
| ST7 | `status --plugin aidd-dev` | Only plugin files shown |
| ST8 | `status` with no manifest | Error: not initialized |

---

## `aidd doctor`

Checks installation health and detects issues.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `[category]` | positional | — | `ai` or `ide` |
| `--plugin <name>` | string | — | Limit check to one plugin |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| D1 | `doctor` (healthy install) | All checks pass, exit 0 |
| D2 | `doctor` (corrupted manifest.json) | Error: invalid manifest |
| D3 | `doctor` (broken @path reference in a rule file) | Warning: broken reference |
| D4 | `doctor` (missing docs dir) | Warning: docs dir missing |
| D5 | `doctor` (orphaned `.claude/rules/` dir with no tracked files) | Warning: orphaned dir |
| D6 | `doctor ai` | Only AI tool checks |
| D7 | `doctor ide` | Only IDE tool checks |
| D8 | `doctor --plugin aidd-dev` | Only aidd-dev plugin checks |
| D9 | `doctor` (not authenticated) | Warning: not authenticated |
| D10 | `doctor` (no manifest) | Error: not initialized |

---

## `aidd clean`

Removes ALL AIDD-managed files.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--force` | boolean | false | Skip confirmation |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| CL1 | `clean --force` | All manifest-tracked files deleted, manifest removed |
| CL2 | `clean` (interactive) | Prompts confirmation |
| CL3 | `clean --force` (no manifest) | Error: not initialized |
| CL4 | `clean --force` (user files mixed in) | User files preserved, framework files deleted |

---

## `aidd telemetry`

Controls the AIDD switch (`.aidd/config.json`) and, on `on`, configures whichever
installed tools can be configured. `on`/`off` do not accept a `[category]` argument.

### `telemetry on`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--endpoint <url>` | string | — | Reused from `.aidd/config.json` when omitted; missing from both is a hard error, nothing written |
| `--scope <local\|project\|user>` | string | `local` | Where Claude Code's `env` block is written |
| `--yes` | boolean | false | Required to confirm `--scope project` (git-tracked) |

### `telemetry off`
No options. Sets `enabled: false`, preserves `endpoint`, never deletes `.aidd/config.json`.

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| T1 | `on` → `on` (endpoint reused) → `off`, `.claude/settings.local.json` pre-seeded with unrelated content | File is byte-identical before and after the whole journey |
| T2 | `on --endpoint <url>` | `aidd.project_id` in the written `env` block matches the temp repo's own `origin` remote, never a leaked `GIT_DIR` |
| T3 | `on --scope project` (no `--yes`) | Exit non-zero; `.aidd/config.json` never created, `.claude/settings.json` byte-unchanged (checked on disk) |
| T4 | `on --scope project --yes` | `.claude/settings.json` (git-tracked) written; `.claude/settings.local.json` and the home-scope file untouched |
| T5 | `on --scope user --yes` | `~/.claude/settings.json` (resolved home dir) written, read independently of the path the command printed; project-scope file unchanged |
| T6 | `on` with Cursor installed | Reported `cursor: cannot be enabled by us`, never `enabled`; exit 0 |
| T7 | `off` when never turned on, Claude + Cursor installed | Exit 0, "already off"; no tool's settings file gains any OTEL key |
| T8 | `on` with no `--endpoint` and no `.aidd/config.json` | Exit non-zero; nothing written — no switch file, no settings file |

---

## `aidd sync`

Propagates local modifications from one tool to others.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--source <tool>` | string | — | Source tool to sync from |
| `--target <tool>` | string | — | Target tool (default: all other installed) |
| `-f, --force` | boolean | false | Overwrite conflicts without prompt |
| `--include-user-files` | boolean | false | Sync user files not tracked in manifest |
| `--plugin <name>` | string | — | Re-hash a plugin and update manifest |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| SY1 | `sync --source claude` (cursor also installed) | Claude mods propagated to cursor |
| SY2 | `sync --source claude --target cursor` | Only cursor gets the changes |
| SY3 | `sync --source claude --force` | Conflicts overwritten |
| SY4 | `sync --plugin aidd-dev` | aidd-dev manifest hashes updated to match disk |
| SY5 | `sync --source claude` (only claude installed) | Nothing to sync |
| SY6 | `sync --include-user-files --source claude` | User-added files also propagated |
| SY7 | `sync` (non-interactive, no `--source`, no `--plugin`) | Error: source required |

---

## `aidd auth`

Manages GitHub authentication.

### `auth login`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--gh` | boolean | false | Use GitHub CLI token |
| `--token <value>` | string | — | Personal access token |
| `--level <user\|project>` | string | — | Storage level |

### `auth logout`
No options.

### `auth status`
No options.

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| A1 | `auth status` (not logged in) | "Not authenticated" |
| A2 | `auth login --token <token>` | Token stored, validated against GitHub |
| A3 | `auth login --gh` | Uses `gh auth token` |
| A4 | `auth login --token <t> --gh` | Error: mutually exclusive |
| A5 | `auth login --level user` | Stored in `~/.config/aidd/auth.json` |
| A6 | `auth login --level project` | Stored in `.aidd/auth.json` |
| A7 | `auth logout` | Removes stored credentials |
| A8 | `auth status` (logged in) | Shows token source + validation status |
| A9 | `auth login --token <invalid>` | Error: token rejected by GitHub API |

---

## `aidd config`

Reads or updates manifest configuration.

### `config list`
No options.

### `config get`

| Argument | Type | Notes |
|----------|------|-------|
| `[key]` | string | `docsDir`, `repo`, `tools` |

### `config set`

| Argument/Option | Type | Notes |
|---------|------|-------|
| `[key]` | string | Writable: `docsDir`, `repo` |
| `[value]` | string | New value |
| `-f, --force` | boolean | Skip confirmation |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| CF1 | `config list` | Shows all manifest fields |
| CF2 | `config get docsDir` | Prints current docs dir |
| CF3 | `config get tools` | Prints installed tools summary |
| CF4 | `config get repo` | Prints repo or blank |
| CF5 | `config set docsDir custom_docs` | `docsDir` updated in manifest |
| CF6 | `config set repo owner/repo` | `repo` updated in manifest |
| CF7 | `config set --force docsDir x` | No prompt |
| CF8 | `config get` (no manifest) | Error: not initialized |
| CF9 | `config get nonexistent` | Error: unknown key |

---

## `aidd marketplace`

Manages plugin marketplaces.

### `marketplace add`

| Argument/Option | Type | Required | Notes |
|---------|------|----------|-------|
| `[name]` | positional | No | Marketplace identifier (prompted if omitted) |
| `[source]` | positional | No | Local path or GitHub repo (prompted if omitted) |
| `--user` | boolean | No | Register at user scope |
| `--yes` | boolean | No | Skip prompts |
| `--overwrite` | boolean | No | Replace existing same-name |
| `--token <value>` | string | No | Auth token |

### `marketplace list`
No options.

### `marketplace remove`

| Argument | Type | Required |
|----------|------|----------|
| `<name>` | positional | Yes |
| `--yes` | boolean | No |

### `marketplace refresh`

| Argument | Type | Notes |
|----------|------|-------|
| `[name]` | positional | Specific marketplace; all if omitted |

### `marketplace browse`

| Argument/Option | Type | Required |
|---------|------|----------|
| `<name>` | positional | Yes |
| `--use-cache` | boolean | No |

### `marketplace check`
No options.

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| M1 | `marketplace add myfw /path/to/fw --yes` | Registered, scope: project |
| M2 | `marketplace add myfw /path/to/fw --user --yes` | Registered, scope: user |
| M3 | `marketplace list` | Shows all registered marketplaces |
| M4 | `marketplace remove myfw --yes` | Removed, installed plugins orphan-cleaned |
| M5 | `marketplace browse myfw` | Lists plugins with name/description/recommended |
| M6 | `marketplace refresh` | All marketplaces refreshed |
| M7 | `marketplace refresh myfw` | Only `myfw` refreshed |
| M8 | `marketplace check` (all fresh) | "All marketplaces fresh" |
| M9 | `marketplace check` (stale) | Lists stale marketplaces |
| M10 | `marketplace add myfw /path --yes` twice | Error: already exists |
| M11 | `marketplace add myfw /path --overwrite --yes` | Replaces existing |
| M12 | `marketplace add x /bad/path --yes` | Error: path not found |
| M13 | `marketplace browse nonexistent` | Error: marketplace not registered |
| M14 | Auto-register: `setup --path <fw>` | `aidd-framework` marketplace auto-registered |

---

## `aidd plugin`

Manages plugins for AI tools.

### `plugin add`

| Argument/Option | Type | Required |
|---------|------|----------|
| `<source>` | positional | Yes | Local path to plugin dir |
| `--tool <toolId>` | string | No | Target tool; all installed if omitted |

### `plugin remove`

| Argument/Option | Type | Required |
|---------|------|----------|
| `<name>` | positional | Yes |
| `--tool <toolId>` | string | No |

### `plugin list`

| Option | Type |
|--------|------|
| `--tool <toolId>` | string |

### `plugin install`

| Argument/Option | Type | Required | Notes |
|---------|------|----------|-------|
| `<plugin>` | positional | Yes | `name` or `name@version` |
| `--from <market>` | string | No | Required when multiple marketplaces match |
| `--tool <toolId>` | string | No |
| `--token <value>` | string | No |
| `--yes` | boolean | No | CI mode |

### `plugin search`

| Argument/Option | Type | Required |
|---------|------|----------|
| `<query>` | positional | Yes |
| `--recommended` | boolean | No |
| `--marketplace <name>` | string | No |

### `plugin pick`

| Option | Type |
|--------|------|
| `--tool <toolId>` | string |

### `plugin update`

| Argument/Option | Type | Required |
|---------|------|----------|
| `[name]` | positional | No | All plugins if omitted |
| `--tool <toolId>` | string | No |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| P1 | `plugin add /path/to/plugin --tool claude` | Plugin files in `.claude/plugins/<name>/` |
| P2 | `plugin add /path/to/plugin` (all tools) | Installed for every installed AI tool |
| P3 | `plugin add /path --tool cursor` | Files in `.cursor/plugins/<name>/`, MCP as `mcp.json` |
| P4 | `plugin list` | Shows all plugins with version per tool |
| P5 | `plugin list --tool claude` | Only claude plugins |
| P6 | `plugin install aidd-dev --tool claude` | Fetched from registered marketplace |
| P7 | `plugin install aidd-dev` (matches 2 marketplaces) | Error: use `--from` |
| P8 | `plugin install aidd-dev --from aidd-framework --tool claude` | Installs from `aidd-framework` marketplace |
| P9 | `plugin install nonexistent --tool claude` | Error: plugin not found |
| P10 | `plugin search sdlc` | Lists matching plugins from all marketplaces |
| P11 | `plugin search sdlc --recommended` | Only recommended results |
| P12 | `plugin search sdlc --marketplace aidd-framework` | Only from `aidd-framework` marketplace |
| P13 | `plugin update aidd-dev --tool claude` | Re-fetches plugin, overwrites files |
| P14 | `plugin update` (all plugins) | Updates all for all tools |
| P15 | `plugin remove aidd-dev --tool claude` | Plugin files deleted, manifest updated |
| P16 | Hooks plugin (aidd-context) install for claude | `hooks.json` + companion scripts in `.claude/plugins/aidd-context/hooks/` |
| P17 | Hooks plugin install for cursor | `hooks.json` converted to cursor format: camelCase events, `${CLAUDE_PLUGIN_ROOT}/` → `./` |
| P18 | MCP plugin (aidd-dev) install for claude | `.mcp.json` merged into `.claude/plugins/aidd-dev/` |
| P19 | MCP plugin (aidd-dev) install for cursor | `mcp.json` (cursor format) installed |

---

## `aidd cache`

Manages local framework version cache.

### `cache list`
No options.

### `cache clear`

| Argument/Option | Type | Required |
|---------|------|----------|
| `[version]` | positional | No |
| `-a, --all` | boolean | No |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| CA1 | `cache list` (no cache) | Empty list |
| CA2 | `cache list` (after release install) | Shows cached versions |
| CA3 | `cache clear v3.9.0` | Removes specific version |
| CA4 | `cache clear --all` | Removes all cached versions |
| CA5 | `cache clear v9.9.9` (not cached) | Error: version not in cache |
| CA6 | `cache clear` (no args, no `--all`, non-interactive) | Error: specify version or `--all` |

---

## `aidd self-update`

Updates the aidd CLI binary.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `--check` | boolean | false | Check only, no install |
| `--dry-run` | boolean | false | Preview without installing |
| `-f, --force` | boolean | false | Reinstall even if up to date |

### Test cases

| # | Scenario | Expected |
|---|----------|----------|
| SU1 | `self-update --check` (up to date) | "Already up to date" |
| SU2 | `self-update --check` (update available) | Shows new version |
| SU3 | `self-update --dry-run` | Shows what would be installed |
| SU4 | `self-update` | Downloads + installs new version |
| SU5 | `self-update --force` | Reinstalls even if same version |

---

## Cross-cutting test scenarios

These span multiple commands and test complete workflows.

| # | Workflow | Commands | Expected |
|---|----------|----------|----------|
| X1 | Full fresh setup | `setup --ai claude` → `plugin install aidd-dev` → `status` | Clean install, all in sync |
| X2 | Install + modify + status + restore | `install ai claude` → edit rule → `status` → `restore` | Drift detected, restored |
| X3 | Multi-tool install + sync | `install --all` → edit claude rule → `sync --source claude` | cursor gets same change |
| X4 | Marketplace lifecycle | `marketplace add` → `plugin install` → `plugin list` → `plugin remove` → `marketplace remove` | Full round-trip |
| X5 | Plugin hooks flow | `plugin install aidd-context --tool claude` | `hooks.json` + `update_memory.js` both present |
| X6 | Clean + reinstall | `clean --force` → `setup --ai claude` | All files reinstalled from scratch |
| X7 | Doctor identifies broken install | Delete tracked file → `doctor` → `restore` | Doctor warns, restore fixes |
| X8 | Brownfield migration | `migrate --dry-run` → `migrate` | Manifest cleaned, plugins re-registered, backup created |
| X9 | Auth + release install (legacy) | `auth login --token <t>` → `install ai claude --release v3.9.0` | Framework downloaded via legacy path, installed |
| X10 | Duplicate marketplace avoidance | `setup --path <fw>` → `marketplace add <fw> --name x` → `plugin install x` | Error: duplicate paths, resolved with `--from` |
| X11 | Remote-mode greenfield (no auth, no tarball) | `setup --mode remote --release v4.1.0-beta.2 --ai claude` | Manifest mode=remote, tool installed from CLI assets, marketplace registered |

---

## Architectural notes

### Marketplace-only architecture (since v4.1.0-beta.2)

- **Setup remote mode**: no framework tarball download. Runtime configs + memory stubs come from bundled CLI assets. Plugins fetched from registered marketplace at the catalog version.
- **Setup local mode**: bundled CLI assets for runtime configs + memory stubs. Local framework path used only for `plugins/` + `.claude-plugin/` copy.
- **Locked decision #10**: Docs dir hardcoded to `aidd_docs`. `--docs-dir` flag removed from setup. `manifest.docsDir` field still mutable via `config set`, but skills always write to literal `aidd_docs/`.
- **Legacy framework-fetch path**: `install`/`update`/`restore` still accept `--path`/`--release` for backward compatibility. These trigger the old `ResolveFrameworkUseCase` flow (downloads tarball or reads local framework dir). Phase 5c will remove these.

### Outstanding refactor work

- **Phase 1.5c (deletion sweep)**: delete `framework-resolver-adapter.ts`, `framework-resolver.ts` port, `infrastructure/tar/`, `resolve-framework-use-case.ts`. Blocked on migrating install/update/restore commands off legacy `--path`/`--release` paths.

---

## Known issues / gaps

| ID | Issue | Severity |
|----|-------|----------|
| K1 | `marketplace browse` shows `@?` version (catalog has no version field) | Low (cosmetic) |
| K2 | `marketplace check` shows stale immediately after `setup` (auto-register but no auto-refresh) | Low (UX) |
| K3 | Local `--path` install copies untracked `aidd_docs/tasks/*/` dev files into user project | Medium |
| K4 | Doctor warns about task plan files with `../framework/` relative paths (dev workspace paths) | Low (expected for local dev) |
| K5 | ~~No cursor hooks support~~ — **fixed**: cursor now converts hooks to camelCase cursor format | Resolved |
| K6 | `manifest.docsDir` mutable via `config set`, but skills hardcode `aidd_docs` (locked decision #10) | Medium (UX inconsistency) |
| K7 | `--release` flag in install/update/restore still triggers legacy framework-fetch path | Low (Phase 1.5c will remove) |
