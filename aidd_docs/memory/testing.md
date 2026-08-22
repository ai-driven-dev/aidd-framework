# Testing Guidelines

## Tools and Frameworks

- **Playwright MCP**: browser automation available via `.playwright-mcp/` config, used for manual or AI-driven UI testing on downstream projects

## Testing Strategy

- The CLI runs vitest in three projects: `unit`, `integration`, `e2e` (`cli/`, ~2,600 tests)
- The plugins' own scripts run under `node --test`, in `scripts/__tests__/`, reaching their subject by path rather than by import
- Skills are validated by running each action's `## Test` end-to-end against a real environment
- Framework correctness validated by running actual skills against a real project (integration)

## Test Execution Process

- **While working, run `pnpm test:changed`** — it runs only the specs a change can break: vitest resolves the CLI's import graph, and the plugin specs are selected by the paths their own text names. Minutes become seconds, and nothing that could break is skipped
- Before declaring work done, run the full suites: `cd cli && pnpm test:unit && pnpm test:integration && pnpm test:e2e`, plus `node --test "scripts/__tests__/*.test.js"`
- Run biome through `rtk proxy` (`rtk proxy npx biome check src/ tests/`): the plain call's output is filtered and reports "no issues" while errors are pending
- Each action declares a `## Test` (a command to run, an artifact check, or an observable side-effect) that must pass before the next action runs
- `scripts/build-dist-verification.md` documents how to verify the build output

## Mocking and Stubbing

Not applicable: the framework has no runtime; all logic is markdown interpreted by an LLM.
