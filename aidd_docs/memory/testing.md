# Testing

How the project is tested: the layers, the tools, and the conventions. Where tests live and how to run them.

## Strategy

- `cli/vitest.workspace.ts` splits three projects: `unit`, `integration`, `e2e`. Each has its own script; `pnpm test` builds first, then runs all three.
- Golden snapshots under `cli/tests/golden/` freeze the per-tool distribution output. The nine-cell `build-per-tool` matrix in `ci.yml` mirrors them, so a drift shows in both.
- The markdown surface — skills, agents, rules — has no runner. An action is validated by its own `## Test` section, run end to end against a real project.
- `scripts/` and the bundled hooks are covered by `node --test` in `scripts/__tests__/`, gated on every commit that touches them.

## Tools

- **vitest** in `cli/` and `kanban/`, with `@vitest/coverage-v8`.
- **fast-check** for property-based cases, **ink-testing-library** for the terminal views.
- **stryker** (`cli/stryker.conf.json`) for mutation testing, run on demand, never in CI.
- **knip** for dead code, gated before push and in `cli-ci.yml`.

## Conventions

- Tests live under `cli/tests/`, mirroring the source layers: `domain/`, `application/`, `infrastructure/`, plus `e2e/`, `golden/`, `fixtures/` and `helpers/`.
- The filesystem and the network arrive through the adapters in `infrastructure/`, so a test substitutes an adapter rather than mocking a module. `vi.mock` is kept for the few adapters that wrap a process or a network call directly.
- `cli/tests/fixtures/` is excluded from the repository's JSON and link checks, since it holds deliberately invalid inputs.
- A plugin never holds its own tests: `hooks/` ships recursively into user projects.

## Run

- `cd cli && pnpm test`: builds, then runs every project. `test:unit`, `test:integration`, `test:e2e` narrow it; `test:kanban` runs the kanban suite.
- `cd cli && pnpm smoke`: builds and runs `scripts/smoke-tools.sh` against the binary.
- `node --test 'scripts/__tests__/*.test.js'`: the repository's own scripts and hooks.
- `pnpm exec lefthook run pre-push`: what CI will run, before you push.
