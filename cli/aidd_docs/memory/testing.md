# Testing

How this package is tested: the layers, the tools, the conventions.

## Strategy

- Four vitest projects (`vitest.workspace.ts`): `unit`, `integration`, `e2e` select by extension anywhere under `tests/`; `architecture` selects `tests/architecture/**/*.arch.test.ts` only, so a stray `*.arch.test.ts` runs nowhere.
- Unit: pure logic. Integration: a use case or adapter, ports substituted. E2E: the real built binary. Architecture: ratchets over source text.
- A pyramid; read the split live.

## Tools

- `vitest`, `fast-check` for properties, `ink-testing-library` for terminal views.
- `stryker` for mutation, per scope, a gate in CI on the scopes a change touches.
- `knip`, `jscpd`, `biome`.

## Conventions

- `tests/` mirrors `src/`; where it does not, the mirror is wrong.
- Doubles from `tests/helpers/ports/`. Substitute at the seam; never mock functional behaviour.
- Fixtures in `tests/fixtures/`, read-only, excluded from JSON and link checks. Mutate a copy in a temp directory.
- `.gitattributes`'s `tests/fixtures/** text eol=lf` keeps byte-for-byte comparisons (`manifest-round-trip.unit.test.ts`) passing on Windows.
- A temp directory: `await mkdtemp(join(tmpdir(), "aidd-<thing>-"))`, never a fixed name (a plantable symlink). The prefix is what `scripts/sweep-stale-test-dirs.cjs` reclaims.
- A test name is a phrase of observable behaviour; nested `describe` reads as a sentence. `E2E:` is a recurring legacy prefix, not one to copy.
- A golden snapshot is machine-independent, never derived from an absolute path: [`golden-machine-independence.md`](../../.claude/skills/test/references/golden-machine-independence.md).
- `describe.concurrent` appears in no unit or integration file; in e2e the golden and command-matrix suites use it, most `telemetry-*` suites do not. An observed split, not a rule.
- A bug fix's review reproduces the user's scenario against the built binary: [`bug-empirical-reproduction.md`](../../.claude/skills/test/references/bug-empirical-reproduction.md).
- A sandboxed run reaches no tool binary and no real profile: `tests/e2e/helpers.ts` narrows `PATH`, relocates `HOME`/`XDG_CONFIG_HOME`/`USERPROFILE`/`APPDATA`; `sandbox-reaches-no-tool-binary.e2e.test.ts` holds it. `CODEX_HOME` is never overridden: a machine setting it points a real `codex` at its own profile regardless.
- Records land under `AppData\Roaming` on Windows, `.config` elsewhere. Assert through the helper.
- Green unit and integration tests prove output shape, never that a tool consumes it: that is `pnpm smoke`.

## Run

- `pnpm test` runs every project; `test:unit`, `test:integration`, `test:e2e`, `test:arch` select one.
- `pnpm smoke` drives the real binary over the command matrix, hermetically. `pnpm smoke:full` adds the remote fetch.
- `pnpm smoke:real` reaches real host registries: [`smoke-real.md`](internal/smoke-real.md).
- `pnpm test:mutation:<scope>`; `mutation-scopes.json` declares each scope's globs (a leading `!` excludes) and the floor its score must hold. `tools` is split at its profiles: a static declaration's mutant reruns every test that loads the file, which made one scope outlast all the others together. A weekly scheduled run replays every mutant with `--force`, so drift through a dependency an incremental run never replays is bounded to a week. `scripts/run-mutation.mjs` fails under the floor and keeps one incremental file per scope under `reports/mutation/<scope>/`; `--force` reruns every mutant. Raise a floor to the measured score after a run; never lower one without the reason in that file.
- A unit or integration test reads the repository through `tests/helpers/repository-root.ts`, never by climbing `../` or `process.cwd()`: a mutation run copies `cli/` into a sandbox, where a relative climb lands nowhere (`tests-reach-the-repository-through-one-helper.arch.test.ts`).
- Read counts live: a suite failing before producing a test contributes zero.

## Gotchas

- Concurrent runs are safe: each e2e run builds under `.e2e-build/`. Nothing under `tests/` resolves into `dist/`.
- `pnpm test` does not build; `dist/` is another run's output.
- A reproduction or manual smoke runs in a fresh temp directory, never at the repository root, which tracks `.codex/config.toml` and `.codex/environments/environment.toml` and gitignores `.vscode/`.
- `setup`'s auto-register always names the marketplace `aidd-framework` (`FRAMEWORK_MARKETPLACE_NAME`, `contexts/distribution/domain/marketplace.ts`); no flag overrides it. Claude's own `add` silently overwrites a known name, which is why `smoke:real` never drives auto-register.
- Alias versus `hostName`, and why two projects sharing one build are no conflict: [`marketplace-identity-is-name-plus-plugins.md`](internal/decisions/marketplace-identity-is-name-plus-plugins.md).
- `pnpm smoke` shares one relocated `$HOME` while `new_project()` spins a fresh directory per cell; several cells auto-register from different paths. Identity by name plus plugin set is what makes that pass.
