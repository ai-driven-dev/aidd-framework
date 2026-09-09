# Coding Assertions

The checks that must pass for code here to count as done. The repository's own hooks also run; this page holds the `cli/` ones.

## Requirements

- No silent errors. A use case or an adapter throws; only the command layer catches.
- Validate at the adapter boundary into typed values. `unknown` never leaks past an adapter.
- No duplication. One fact, one home.
- A context's `domain/` imports no infrastructure, and nothing widens a type through `unknown` or `never` — in `tests/` as much as in `src/`.
- The tree is organised by bounded context (`src/contexts/`), not by layer. Placement rules: `.claude/rules/00-architecture/`.
- Runtime dependencies are capped; the list and its reason are in `architecture.md`.

## Before commit

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm lint` | biome, lint and format, plus the GritQL plugin under `biome-plugins/` (`process.exit` below the command edge) and `noDefaultExport` under `src/` and `tests/`; `biome-guards-bite.arch.test.ts` proves both on a planted tree |
| 2 | `pnpm test:arch` | the architecture ratchets |
| 3 | `pnpm typecheck` | `tsc --noEmit` |
| 4 | `node scripts/check-cli-type-honesty.mjs` | no type widened through `unknown`, `any` or `never`, no `@ts-expect-error`/`@ts-ignore` outside a test proving something doesn't compile (`src/` and `tests/`). Dependency direction between layers and contexts is biome's job now (`cli/biome.json`'s `noRestrictedImports`). Run it from the repository root |

## Before push

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm knip` | dead code, unused exports |
| 2 | `pnpm test` | every tier |

## In CI only

- `pnpm test:coverage` against the thresholds in `vitest.config.ts`, `pnpm smoke`, `pnpm build` with its bundle budget, `pnpm jscpd`, and one mutation job per scope a change touches (`cli-mutation`, floors in `mutation-scopes.json`, scope choice in `scripts/mutation-scopes-to-run.mjs`) — none of them a local gate. The full job list behind them is `deployment.md`'s, not repeated here. Every job is fanned into one required check, `cli / gate` (`.github/workflows/cli-ci.yml`), which the branch rulesets enforce (`.github/rulesets/main.json`, `next.json`) — so all of them are blocking on a `cli/` pull request, through that one check.
- CodeQL (`.github/workflows/codeql.yml`) analyses this package on every pull request against `main` and `next`, outside `cli / gate` and blocking nothing — its findings are read from the Security tab, per pull request, and answered there.

## Behavior

Same as the repository's own page (`aidd_docs/memory/coding-assertions.md`): every gate green, one agent per failing assertion.
