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

## Distribution

- npm bin `aidd` → `dist/cli.js`. Single ESM bundle; the five JSON schemas beside it are read from disk at runtime, so `files` must keep shipping them.
- Run through `npx @ai-driven-dev/cli@latest`, or install globally. Build and publish: `deployment.md`.
