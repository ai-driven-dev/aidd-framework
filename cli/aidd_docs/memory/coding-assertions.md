# Coding Guidelines

> Those rules must be minimal because they MUST be checked after EVERY CODE GENERATION.

## Requirements to complete a feature

**A feature is really completed if ALL of the above are satisfied: if not, iterate to fix all until all are green.**

- No silent errors — throw early, fail loudly
- Validate I/O at the adapter boundary into typed domain values — `unknown` never leaks past an adapter, and absence is modeled explicitly, not with empty-string sentinels
- No duplication — eliminate ruthlessly, reuse existing code
- Domain layer has zero infrastructure imports
- Runtime deps capped at the 6 justified in `architecture.md` (`commander`, `@inquirer/prompts`, `ajv`, `ajv-formats`, `simple-git`, `smol-toml`); a new one needs an ADR
- 3-layer architecture respected: Domain → Application → Infrastructure (no Presentation layer — output formatting lives in `application/output.ts`)

## Steps to follow

1. Check there is no duplication
2. Ensure code is re-used
3. Run all those commands, in order to ensure code is perfect.

## Commands to run

### Before commit

| Order | Command               | Description                        |
| ----- | --------------------- | ---------------------------------- |
| 1     | `pnpm typecheck`      | Type checking                      |
| 2     | `pnpm lint`           | Lint + format (biome)              |
| 3     | `pnpm knip`| Dead code / unused exports (knip)  |
| 4     | `pnpm jscpd`          | Duplication check (jscpd)          |
| 5     | `pnpm test`           | Run unit tests                     |

### Before push

| Order | Command      | Description         |
| ----- | ------------ | ------------------- |
| 1     | `pnpm build` | Verify build output |
| 2     | `pnpm test`  | Full test suite     |
