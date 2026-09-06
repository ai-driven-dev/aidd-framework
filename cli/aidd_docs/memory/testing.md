# Testing

How this package is tested: the layers, the tools, the conventions.

## Strategy

- Four vitest projects (`vitest.workspace.ts`). `unit`, `integration` and `e2e` select by extension alone, anywhere under `tests/`: `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`. `architecture` selects by extension *and* folder — `tests/architecture/**/*.arch.test.ts` — so a `*.arch.test.ts` file placed outside `tests/architecture/` matches no project and runs nowhere, silently.
- Unit: pure logic, no I/O. Integration: a use case or an adapter, its ports substituted. E2E: a full journey through the real built binary. Architecture: ratchets over source text, no build, no imports.
- Shape stays a pyramid. Read the split live rather than trusting a number.

## Tools

- `vitest`, `fast-check` for property cases, `ink-testing-library` for terminal views.
- `stryker` for mutation, on demand, never a gate.
- `knip` for dead code, `jscpd` for duplication, `biome` for lint and format.

## Conventions

- Tests live under `tests/`, mirroring `src/`. Where they do not, the mirror is what is wrong.
- Doubles come from `tests/helpers/ports/`. Substitute at the seam; never mock functional behaviour.
- Fixtures live in `tests/fixtures/`; `tests/fixtures/` is excluded from the JSON and link checks because it holds deliberately invalid input. Read-only: a test that needs to mutate one copies it into a temp directory first, never edits it in place.
- A test name is a phrase of observable behaviour, nested `describe` blocks reading like a sentence — not a category prefix followed by a separator. `E2E:` is the one prefix style that still recurs (17 files under `tests/e2e/` and `tests/golden/`), a naming choice that predates this convention rather than an exception to keep copying.
- A golden snapshot must be machine-independent: never snapshot a value derived from an absolute path, hash included — [`golden-machine-independence.md`](../../.claude/skills/test/references/golden-machine-independence.md) has the symptom and root-cause pattern.
- `describe.concurrent` never appears in a `*.unit.test.ts` or `*.integration.test.ts` file today. Inside `*.e2e.test.ts` it is not universal either: the golden and command-matrix suites use it throughout, but roughly two-thirds of `tests/e2e/*.e2e.test.ts` (most of the `telemetry-*` suites) run a plain `describe` with no stated reason — read as an observed split, not an enforced rule.
- A bug fix's review needs an empirical reproduction of the user's own scenario against the real built binary, not only simplified fixtures: [`bug-empirical-reproduction.md`](../../.claude/skills/test/references/bug-empirical-reproduction.md).
- A sandboxed run must reach no AI-tool binary and no real profile. `tests/e2e/helpers.ts` narrows `PATH` and relocates `HOME`/`XDG_CONFIG_HOME`/`USERPROFILE`/`APPDATA`; `sandbox-reaches-no-tool-binary.e2e.test.ts` holds that boundary. It never overrides `CODEX_HOME`: a machine that has it set points a real `codex` binary at its own profile regardless of `HOME`.
- Where a sandboxed run writes differs by platform — the records directory lands under `AppData\Roaming` on Windows, `.config` elsewhere. Assert through the helper, never a literal path.
- Green unit and integration tests prove this CLI's output shape, never that a tool consumes it. That is what `pnpm smoke` is for.

## Run

- `pnpm test` runs every project. `test:unit`, `test:integration`, `test:e2e`, `test:arch` select one.
- `pnpm smoke` drives the real binary over the whole command matrix, hermetically. `pnpm smoke:full` adds the remote fetch.
- `pnpm test:mutation:<scope>` runs one scope; `mutation-scopes.json` is the single declaration of what is covered and what is excluded.
- Read counts live. A suite that fails before producing a test contributes zero, so a run is green only when the suite counts match too.

## Gotchas

- Two concurrent runs are safe: each e2e run builds its own binary under `.e2e-build/` and publishes the path. Nothing under `tests/` may resolve into `dist/`.
- `pnpm test` does not build. Anything reading `dist/` is reading another run's output.
- An empirical reproduction or a manual smoke check runs in a fresh temporary directory, never at the repository root. This checkout already tracks `.codex/config.toml` and `.codex/environments/environment.toml`, and gitignores `.vscode/`; an install run at the root risks silently rewriting the tracked file or dropping ignored noise, on top of the untracked `.cursor/`, `.opencode/`, `opencode.json`, `.github/copilot/` an install would create for every other tool.
