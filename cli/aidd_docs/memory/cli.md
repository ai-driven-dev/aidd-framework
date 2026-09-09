# CLI

The `aidd` command-line tool: its commands, inputs, and distribution.

## Commands

Thirty-three leaf commands. Read them live: `aidd --help`, then each group's. `scripts/smoke-tools.sh` exercises every one and fails when its list drifts.

- `setup`, `doctor`, `sync`, `clean`: bring a project to a correct state, keep it there.
- `framework install | update | remove | rules`, chosen by `--tool <id>`.
- `plugin install | list | remove | search | update`.
- `marketplace add | list | remove | refresh | check`.
- `auth login | logout | status`.
- `telemetry on | off | read | report | check | forget | identity`; `identity` carries `use | off | link | unlink`.
- `translate <source>`: author-side, converts a source into a target-native plugin tree.
- `update`, aliased `upgrade`: the CLI itself.

## Interface

- Parser: `commander` (`src/cli.ts`). A `preAction` hook builds the graph once per project root.
- No argument on a TTY: the interactive menu. Without one: help.
- Global flags `--version`, `--verbose`. A non-TTY needs explicit flags or exits 1.
- Text on stdout, errors on stderr (`src/presentation/output.ts`). Typed exceptions caught at the command layer only (`src/presentation/error-handler.ts`).
- The update-check hook is the one swallow; it never fails the command asked for.
- Exit codes: `0` ok; `1` error, unhealthy `doctor`, non-interactive guard.

## `doctor`

- For claude, codex, copilot: compares `nativeRegistrations` against the host's registry file.
- Four answers: `registered`; `not-registered` and `registered-disabled` (`error`, fix names `aidd sync` or `aidd framework install --tool <id>`); `unanswerable` (`info`, never gates: the host never ran).
- A fifth pass, `checkMarketplaceSources`, reports a source conflict by `hostName`: [`marketplace-identity-is-name-plus-plugins.md`](internal/decisions/marketplace-identity-is-name-plus-plugins.md).
- Warns on a host ahead of this aidd (`aidd update`) or behind the migration (`aidd sync`): [`framework-source-is-machine-scope.md`](internal/decisions/framework-source-is-machine-scope.md).

## `sync`

- Restores tracked files, then drives native activation (`MarketplaceSyncSettingsUseCase.execute`). Reversed, it would hash a file restoration overwrites.
- `marketplace add <name>` and `plugin install --from <name>` narrow activation to that marketplace and merge into `nativeRegistrations`; `sync` alone re-drives every one.
- A manifest whose registry names no marketplace (a fresh clone) re-registers the framework source, then proceeds.
- Records this project's claim in `references.json` when the source resolves to scope `"user"`.
- `sync --tool <id>` narrows to one tool.
- A missing binary warns and exits `0`; a genuine activation failure throws `SyncFailedError`, exit `1`.
- Refuses a marketplace-name conflict before calling the host's `add`, counted in `SyncFailedError`.
- Migrates a pre-shared-source project on every run: [`framework-source-is-machine-scope.md`](internal/decisions/framework-source-is-machine-scope.md).

## `clean`

- Leaves nothing of aidd's, removes nothing aidd did not write, drives the host CLI for its registry.
- Exception: the shared `aidd-framework` registration stays; the warning names what survives and the order to remove it (`aidd clean` per project, then `aidd clean --scope user`).
- `clean --scope user` purges the shared source under a hardcoded whitelist.
- Steps, containment and whitelist: [`clean-drives-the-host-cli.md`](internal/decisions/clean-drives-the-host-cli.md).

## Distribution

- npm bin `aidd` → `dist/cli.js`, one ESM bundle plus five JSON schemas read from disk; `files` must ship them.
- `npx @ai-driven-dev/cli@latest`, or global install. Build and publish: `deployment.md`.
- `AIDD_USER_CONFIG_DIR` relocates `userConfigDir()`; the one list of what moves: `auth.json`; `marketplaces.json` and `cache/built/<version>/`; `references.json`; the `--scope user` `manifest.json`; `cache/update-check.json` and the older root `update-check.json` (`runtime/self-update/check-update-use-case.ts`); the telemetry sink root, only as a legacy fallback when `AIDD_TELEMETRY_DIR` is unset (`telemetry.md`). Never `identity.json`, which `resolveAiddConfigDir()` (`kernel/reading/home-dir.ts`) refuses this variable for.
