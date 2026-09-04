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
| 1 | `pnpm lint` | biome, lint and format |
| 2 | `pnpm test:arch` | the architecture ratchets |
| 3 | `pnpm typecheck` | `tsc --noEmit` |
| 4 | `node scripts/check-cli-layering.mjs` | dependencies point inward, no widened type. Run it from the repository root |

## Before push

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm knip` | dead code, unused exports |
| 2 | `pnpm test` | every tier |

## In CI only

- `pnpm test:coverage` against the thresholds in `vitest.config.ts`, `pnpm smoke`, `pnpm build` with its bundle budget, `pnpm jscpd`. All blocking on a `cli/` pull request.

## Behavior

Done means every gate green. On failure, one agent per failing assertion — typecheck, tests, rules — not one agent for all.
