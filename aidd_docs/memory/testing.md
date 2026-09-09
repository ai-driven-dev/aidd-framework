# Testing

How the project is tested: the layers, the tools, and the conventions. Where tests live and how to run them.

> CLI internals (tiers, fixtures, naming, mocking) live in [`cli/aidd_docs/memory/testing.md`](../../cli/aidd_docs/memory/testing.md). This page is the repository-wide view.

## Strategy

| Surface | Validated by |
| --- | --- |
| Skills, agents, rules (markdown) | each action's own `## Test`, run end to end against a real project |
| `scripts/` and bundled hooks | `node --test` under the wrapper below |
| `cli/` | vitest, four projects — see the CLI bank |
| `kanban/` | its own vitest suite. It shares no code with `cli/` |
| Per-tool distributions | golden snapshots in `cli/tests/golden/`, mirrored by the `build-per-tool` CI matrix |
| Browser journeys | `aidd-dev:11-browser-qa`, see below |

## Tools

| Tool | Use |
| --- | --- |
| vitest | `cli/`, `kanban/` |
| stryker | mutation, per CLI scope, gated in `cli-ci.yml` on the scopes a change touches |
| knip | dead code, before push and in `cli-ci.yml` |
| `@playwright/cli` | browser QA evidence, pinned, never an app dependency |

## Conventions

- A plugin never holds its own tests: `hooks/` ships recursively into user projects. Tests for a bundled script go in `scripts/__tests__/`.
- The scripts suite writes into a git repository. Run it wrapped, never bare: unwrapped it can overwrite this repository's own `.git/hooks`, and `.git` is in no history.

## Run

| Command | Scope |
| --- | --- |
| `pnpm test:changed` | only the specs a change can break — vitest resolves the CLI's import graph, and the plugin specs are selected by the paths their own text names. What to run while working |
| `node scripts/check-tests-leave-git-alone.js -- node --test 'scripts/__tests__/**/*.test.js'` | repository scripts and hooks |
| `cd cli && pnpm test` | the four CLI projects. It does not build |
| `cd cli && pnpm smoke` | built binary against `cli/scripts/smoke-tools.sh` |
| `cd kanban && pnpm test` | the board |
| `pnpm exec lefthook run pre-push` | the local gate before pushing |

CI runs more: `validate.yml` re-runs the whole pre-commit over the whole tree on every push and pull request, and `cli-ci.yml` adds jobs no local hook has. Both are in `deployment.md`.

## Browser QA

- Runner: `npx --yes @playwright/cli@0.1.17`, the framework pin. Never `latest` during QA.
- Also required: `ffmpeg` and `ffprobe`. Output is WebM evidence per scenario.
- Owned by `aidd-dev:11-browser-qa`; this repository ships the capability, it has no browser journey of its own.
