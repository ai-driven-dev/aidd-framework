# 04 - Test

Write unit tests for the domain type covering invariants, equality, and invalid input rejection.

## Inputs

- `type-name` (required) - string, the PascalCase name of the type
- `file-path` (required) - string, absolute path to the source file produced in 03

## Outputs

```
Test file: tests/contexts/framework/domain/<kebab-name>.unit.test.ts
```

## Depends on

- `03-place`

## Process

1. Create `tests/contexts/framework/domain/<kebab-name>.unit.test.ts`. Use `*.unit.test.ts` suffix — no I/O, no mocks, no filesystem per `references/test-pyramid.md` in the `test` skill.
2. Name each `it()` block as a behavior sentence describing the observable outcome, not the method called — see `references/test-pyramid.md` in the `test` skill.
3. Cover: valid construction succeeds, invalid inputs throw a typed error, `.equals()` returns true for structurally equal instances and false when different (value objects only), mutations return new instances (value objects only).
4. For discriminant unions: test that the union type exhaustively covers all expected members by writing a switch that TypeScript narrows without a `default` branch.
5. No mocks — domain types are pure; call constructors and methods directly.
6. Group tests with `describe()` blocks by type name, not by method name — see memory file `feedback_test_naming.md`.

## Test

Run `pnpm test:unit` — exits 0 with all new `it()` blocks passing.
