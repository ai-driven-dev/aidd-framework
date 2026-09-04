# Testing

How this package is tested: the layers, the tools, the conventions.

## Strategy

- Four vitest projects, selected by file extension, not by folder: `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`, `*.arch.test.ts`.
- Unit: pure logic, no I/O. Integration: a use case or an adapter, its ports substituted. E2E: a full journey through the real built binary. Architecture: ratchets over source text, no build, no imports.
- The extension declares the tier; the folder does not. Both drift, and the extension is the one vitest reads.
- Shape stays a pyramid. Read the split live rather than trusting a number.

## Tools

- `vitest`, `fast-check` for property cases, `ink-testing-library` for terminal views.
- `stryker` for mutation, on demand, never a gate.
- `knip` for dead code, `jscpd` for duplication, `biome` for lint and format.

## Conventions

- Tests live under `tests/`, mirroring `src/`. Where they do not, the mirror is what is wrong.
- Doubles come from `tests/helpers/ports/`. Substitute at the seam; never mock functional behaviour.
- Fixtures live in `tests/fixtures/`; `tests/fixtures/` is excluded from the JSON and link checks because it holds deliberately invalid input.
- A golden snapshot must be machine-independent: never snapshot a value derived from an absolute path, hash included.
- A sandboxed run must reach no AI-tool binary and no real profile. `tests/e2e/helpers.ts` narrows `PATH` and relocates the home; `sandbox-reaches-no-tool-binary.e2e.test.ts` holds that boundary.
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
