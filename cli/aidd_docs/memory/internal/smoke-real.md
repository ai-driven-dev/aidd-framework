# `smoke:real`

`scripts/smoke-real.sh`: the one check that reaches a real AI-tool binary's own registry. Opt-in, local-only, never CI, never lefthook.

## Why it exists

- `smoke-tools.sh` relocates `HOME`, so it proves only that this CLI *called* a host, never that the host registered anything.

## Names

- Never the reserved `aidd-framework`; `setup`'s auto-register always takes it.
- `aidd-smoke-<epoch>-<pid>` for project scope, `<that>-user` for machine scope.
- One built under the project's `.aidd/cache/`, the other under `userConfigDir()/cache/built/<version>/`; one name at both scopes would collide on a host key.
- `--strict` refuses if a real `aidd-framework` registration exists anywhere in `$HOME`; default `--allow-existing` relies on the unique names.

## Environment

- `HOME` stays real.
- `AIDD_USER_CONFIG_DIR` relocated into the run's temp root, exported before the first `aidd` call.
- `identity.json` does not follow (`resolveAiddConfigDir()` refuses the variable); a phase relying on relocated identity reaches the real profile.
- Every `--scope user` call passes `--no-default-marketplace`, or `setup --scope user` registers the reserved name at every host.
- Skips per tool, never fails, for a binary absent from `PATH`.

## Phases, in order

1. Files-only `setup`.
2. Native registration and `plugin install` under the project-scope name.
   Then each host's own inventory: `claude plugin details` lists the fixture's skills, hook events and MCP servers (never its agents: Claude counts none, measured 2026-09-09), `codex plugin list` marks it installed and enabled, `copilot plugin list` enabled. Cursor and opencode expose no inventory command.
3. `doctor`.
4. A host-side `claude plugin uninstall --scope local`, then the `sync --force` that repairs it.
5. Opencode's bridge.
6. Two `marketplace add` guards: a different catalog under one name, an alias diverging from the catalog's.
7. `setup --scope user`: project clean per `git status --porcelain`, `userConfigDir()/manifest.json` appears, `doctor --scope user` healthy.
8. Two projects sharing one machine-scope marketplace.
9. `clean --force` in the first.
10. `clean --scope user --force`, plus its no-user-manifest variant against its own config dir.

## Trap

- `clean --force` for every project created, then `clean --scope user --force`, however the run ends.
- Only the user manifest records a machine-scope registration; the trap recreates it first, or a run dead before `sync --scope user` strands the registration at every host.
- `copilot_purge_disabled_run_keys` removes only `$REF` and `$REF_USER` from `~/.copilot/settings.json`, and only while still `false`; a `true` one is reported `bad`. Copilot keeps a disabled ref at `false` rather than deleting it, and `aidd clean` never writes a host registry by hand.
- Cost: about twenty minutes with all five binaries; each codex round-trip pays its own marketplace refresh.

## Measured facts

- A project-scope `clean --force` protects a `scope: "user"` registration on the scope, not the name. The "left enabled, another project still references it" clause never fires here (`$MKT` is never the reserved name); it is asserted by `clean-shared-ref-guard.integration.test.ts` and `tests/e2e/clean-shared-ref-codex.e2e.test.ts`.
- What such a clean costs another project is its user-scope Cursor directory: `doctor` reports it, `aidd sync` repairs it.
- `clean --scope user --force` deletes the `aidd-framework` entry alone; another machine-scope entry survives, pointing at a removed `cache/built/`.
- `pnpm smoke`'s matrix registers fixtures under aliases their catalogs do not declare (`local`/`local-mkt`, `scoped`/`local-mkt`, `userscoped`/`user-mkt`): a supported divergence, so `smoke-tools.sh` needed no change and passes its whole matrix.
