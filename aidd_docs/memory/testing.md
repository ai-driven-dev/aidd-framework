# Testing

How the project is tested: the layers, the tools, and the conventions. Where tests live and how to run them.

> CLI internals (tiers, fixtures, naming, mocking) live in [`cli/aidd_docs/memory/testing.md`](../../cli/aidd_docs/memory/testing.md). This page is the repository-wide view.

## Strategy

| Surface | Validated by |
| --- | --- |
| Skills, agents, rules (markdown) | each action's own `## Test`, run end to end against a real project |
| `scripts/` and bundled hooks | `node --test scripts/__tests__/*.test.js` |
| `cli/` and `kanban/` | vitest, three tiers — see the CLI bank |
| Per-tool distributions | golden snapshots in `cli/tests/golden/`, mirrored by the `build-per-tool` CI matrix |
| Browser journeys | `aidd-dev:11-browser-qa`, see below |

## Tools

| Tool | Use |
| --- | --- |
| vitest | `cli/`, `kanban/` |
| fast-check | property-based cases |
| ink-testing-library | terminal views |
| stryker | mutation, on demand, never in CI |
| knip | dead code, before push and in `cli-ci.yml` |
| `@playwright/cli` | browser QA evidence, pinned, never an app dependency |

## Conventions

- A plugin never holds its own tests: `hooks/` ships recursively into user projects. Tests for a bundled script go in `scripts/__tests__/`.
- `cli/tests/fixtures/` is excluded from the JSON and link checks; it holds deliberately invalid inputs.
- Adapters are substituted, not mocked, wherever the seam exists.

## Run

| Command | Scope |
| --- | --- |
| `node --test 'scripts/__tests__/*.test.js'` | repository scripts and hooks |
| `cd cli && pnpm test` | build, then all three CLI tiers |
| `cd cli && pnpm smoke` | built binary against `scripts/smoke-tools.sh` |
| `pnpm exec lefthook run pre-push` | what CI runs |

## Browser QA

- Runner: `npx --yes @playwright/cli@0.1.17`, the framework pin. Never `latest` during QA.
- Also required: `ffmpeg` and `ffprobe`. Output is WebM evidence per scenario.
- Owned by `aidd-dev:11-browser-qa`; this repository ships the capability, it has no browser journey of its own.
