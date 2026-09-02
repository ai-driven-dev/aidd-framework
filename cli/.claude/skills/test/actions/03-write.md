# 03 - Write

Write the test file following tier-specific conventions.

## Inputs

- `tier` (required) - string, one of `unit`, `integration`, `e2e`
- `names` (required) - list of describe/it names from 02
- `target-file` (required) - string, path to the production source under test

## Outputs

```
Test file at the correct path with the correct suffix.
```

## Depends on

- `02-name-behaviorally`

## Process

1. Create the test file at:
   - Unit: `tests/application/use-cases/<kebab-name>.unit.test.ts` or `tests/contexts/framework/domain/<kebab-name>.unit.test.ts`
   - Integration: `tests/infrastructure/adapters/<kebab-name>-adapter.integration.test.ts` or `tests/application/use-cases/<kebab-name>.integration.test.ts`
   - E2E: `tests/e2e/<kebab-name>.e2e.test.ts`

2. **Unit tests** — mock all ports via `tests/helpers/ports/` in-memory implementations. No real I/O. No `describe.concurrent()`.

3. **Integration tests** — use real temp filesystem when adapter boundary behavior is the target. Mock servers for HTTP. Cover: error parsing, retry logic, format serialization.

4. **E2E tests** — invoke CLI via `runCli()` from `tests/e2e/helpers.ts`. Use `describe.concurrent()` at the top level. `try/finally` for cleanup. Marketplace = local fixture at `tests/fixtures/framework-real`. Zero real network.

5. Use fixtures from `tests/fixtures/` — never mutate directly; copy to a temp directory before use.

6. Apply the names from 02. No snapshot tests on menu trees or output strings.

7. For bug fixes: write the test BEFORE touching production code. Confirm the test fails on the current code, then fix.

## Test

Run `pnpm test:unit`, `pnpm test:integration`, or `pnpm test:e2e` (matching the tier) — exits 0 with all new `it()` blocks passing.
