# 05 - Test

Write pyramid coverage across all touched layers.

## Inputs

- `touched-layers` (required) - list of layers changed in 01-04 (e.g. `domain-model, use-case, command`)

## Outputs

Test files at the appropriate tiers in `tests/`.

## Depends on

- `01-domain-model`, `02-use-case`, `03-adapter`, `04-command` (or confirmed skips)

## Process

1. Invoke the `test` skill starting at its `01-pick-tier` action for each touched layer.
2. For domain types: unit tests (`tests/contexts/framework/domain/`).
3. For use-cases: unit tests (`tests/application/use-cases/`).
4. For adapters: integration tests (`tests/infrastructure/adapters/`).
5. For commands: E2E tests (`tests/e2e/`) covering the full user journey — 5–10 scenarios max.
6. Never skip 05. Every feature change requires tests; skipping is not allowed.
7. For user-reported bug fixes: also invoke `04-empirical-repro` from the `test` skill.

## Test

`pnpm test` exits 0 — full build + all tiers pass.
