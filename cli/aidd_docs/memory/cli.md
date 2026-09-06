# CLI

The `aidd` command-line tool: its commands, inputs, and distribution.

## Commands

Thirty-three leaf commands. Read them live — `aidd --help`, then each group's. `scripts/smoke-tools.sh` exercises every one and fails when its list drifts from the binary's.

- `setup`, `doctor`, `sync`, `clean` — bring a project to a correct state, then keep it there
- `framework install | update | remove | rules` — the framework's lifecycle on a tool, chosen by `--tool <id>`
- `plugin install | list | remove | search | update`
- `marketplace add | list | remove | refresh | check`
- `auth login | logout | status`
- `telemetry on | off | read | report | check | forget | identity` — `identity` carries `use | off | link | unlink`
- `translate <source>` — author-side, converts a source into a target-native plugin tree
- `update` — the CLI itself, aliased `upgrade`

## Interface

- Parser: `commander` (`src/cli.ts`). A `preAction` hook builds the dependency graph once per project root.
- No argument on a TTY runs the interactive menu and never reaches the parser. No argument without one prints help.
- Global flags: `--version`, `--verbose`. Interactive by default; a non-TTY needs explicit flags or exits 1.
- Text on stdout, errors on stderr (`src/presentation/output.ts`). Typed exceptions travel inward, caught at the command layer only (`src/presentation/error-handler.ts`).
- The update-check hook is the one place that swallows: it must never fail the command a person asked for.
- Exit codes: `0` ok; `1` on error, an unhealthy `doctor`, or a non-interactive guard.
- `doctor`, for a tool whose plugins activate through its own CLI (claude, codex, copilot): compares `nativeRegistrations` against that host's own registry file, four answers — `registered` (no issue), `not-registered` and `registered-disabled` (`error`, gate `doctor` unhealthy, fix names `aidd sync` or `aidd framework install --tool <id>`), `unanswerable` (`info`, never gates — the normal state on a machine that has never run the tool's own binary).
- `sync` restores tracked files, then drives native activation the same way `setup` and `framework install` do (`MarketplaceSyncSettingsUseCase.execute`, restoration first, activation after — reversing the order would hash a settings file restoration is about to overwrite). `sync --tool <id>` narrows activation to that tool alone. A tool whose binary is absent warns that its plugin will not load until that CLI has run and still exits `0`; a genuine activation failure (not the recoverable, best-effort kind) throws `SyncFailedError` and exits `1`.
- `clean` leaves nothing of aidd's, in the project or on the machine, and never removes anything aidd did not write. Order is a hard constraint: (1) undo a host's own native registration through that host's own CLI — `uninstallPlugin` for every recorded ref, then `removeMarketplace` at the scope it was added at, because only Copilot declares a force-remove argument and Claude/Codex can refuse to drop a marketplace that still has plugins on it — before (2) tracked files, merge files and plugin files are deleted, before (3) `.aidd/` itself, since a host's own CLI needs the built tree under `.aidd/cache/` to still exist to resolve what it is unregistering. A tool whose binary is off `PATH` gets named and left alone, never touched by `rm`. (4) Machine-local files no `plugins[].files` entry tracks — `.claude/settings.local.json`, and a project-scope-merged `.cursor/hooks.json` plus its plugin's own `.cursor/hooks/<plugin>/` — are removed through the same unmerge `plugin remove` already drives for one plugin (`application/shared/remove-project-hooks.ts`). (5) A user-scope plugin's own directory (`~/.cursor/plugins/local/<plugin>`) is deleted only once its real, `realpath`-resolved location is proven to sit strictly inside the tool's declared user-scope directory (`domain/plugins/user-scope-containment.ts`) — a `..` segment a corrupted manifest entry carries, or a plugin directory that became a symlink after install, is left in place and named rather than followed.

## Distribution

- npm bin `aidd` → `dist/cli.js`. Single ESM bundle; the five JSON schemas beside it are read from disk at runtime, so `files` must keep shipping them.
- Run through `npx @ai-driven-dev/cli@latest`, or install globally. Build and publish: `deployment.md`.
