# 04 - Test

Write unit tests for the capability class covering valid construction, invalid params, and
all public method behaviors.

## Inputs

- `capability-name` (required) - string, PascalCase class name (e.g. `WidgetsCapability`)
- `capability-file` (required) - string, path to the source file from 02

## Outputs

```
Test file: tests/contexts/framework/domain/<kebab-name>-capability.unit.test.ts
```

## Depends on

- `02-write-capability-class`

## Process

1. Create `tests/contexts/framework/domain/<kebab-name>-capability.unit.test.ts`. Use `*.unit.test.ts` suffix — no I/O, no mocks, no filesystem.
2. Import only the class under test and `CapabilityConfigError` from `kernel/errors.js`.
3. Cover valid construction:
   - All required params provided → fields are assigned correctly.
   - Optional param omitted → default value is used.
   - Optional param provided → provided value overrides default.
4. Cover invalid construction:
   - Each validation that throws `CapabilityConfigError` → confirm the error is thrown.
5. Cover each public method:
   - Happy path returns the expected value.
   - Edge case (empty string, zero, boundary value) returns expected value or throws expected error.
6. Name `it()` blocks as behavior sentences: "assigns the default widget dir when none is provided" not "calls constructor".
7. Group tests with `describe('WidgetsCapability')` block — see memory `feedback_test_naming.md`.
8. No mocks — capability classes are pure objects; call constructors and methods directly.

## Test

Run `pnpm test:unit` — exits 0 with all new `it()` blocks passing.
