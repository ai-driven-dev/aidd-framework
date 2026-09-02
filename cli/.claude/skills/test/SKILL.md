---
name: test
description: >
  Creates or modifies tests in tests/ following the project's three-tier pyramid. Use when
  writing tests for a new or existing use-case, adapter, domain model, or CLI command; when
  reproducing a user-reported bug; or when auditing coverage. Do NOT use for implementing
  production code — use the context skill that owns the concept (`tools`, `translate`,
  `distribution`, `framework`) instead.
---

# Test

Writes tests at the correct tier of the project's test pyramid: unit for domain and use-case
logic, integration for adapter behavior and real-filesystem contracts, E2E for full CLI
journeys. Bug fixes always start with a failing test that reproduces the exact reported
scenario before any production code is touched.

## Available actions

| #   | Action                | Role                                              | Input                                   |
| --- | --------------------- | ------------------------------------------------- | --------------------------------------- |
| 01  | `pick-tier`           | Choose unit, integration, or e2e based on what is under test | target file or behavior         |
| 02  | `name-behaviorally`   | Draft behavior-sentence test names               | list of scenarios to cover              |
| 03  | `write`               | Write the test file following tier conventions    | tier + names from 01-02                 |
| 04  | `empirical-repro`     | Produce an empirical reproduction transcript for user-reported bugs | bug report   |
| 05  | `smoke`               | Run real CLI binary in /tmp, verify end-to-end   | command + expected behavior             |

## Default flow

`01 → 02 → 03`

For user-reported bugs: `01 → 02 → 03 → 04`

Smoke (`05`) is standalone: invoke it when validating that a CLI command or feature works for a real user, after a feature ships or before a release. It is not part of the `01 → 03` write flow.

## Transversal rules

- File suffix must match tier: `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`.
- Mock only ports (domain interfaces) — never mock use-case internals or adapter implementations.
- Test name = observable behaviour sentence; use nested `describe` blocks not prefix separators.
- `describe.concurrent()` is forbidden in unit tests; required in E2E tests.
- Zero real network, zero real machine state outside temp dirs in any automated test.
- Write the failing test FIRST for every bug fix.
- Smoke tests run the real built binary in a fresh `/tmp` dir, never the repo root.

## References

- `references/test-pyramid.md` — tier definitions, rules per tier, forbidden patterns (authoritative)
- `references/bug-empirical-reproduction.md` — empirical reproduction mandate, transcript format (authoritative)
- `references/golden-machine-independence.md` — golden/snapshot tests must never snapshot values derived from absolute paths (including hashes over path-bearing content); normalize source content before hashing (authoritative)
- `references/smoke-in-tmp.md` — smoke/dogfood installs must run in /tmp only; in-repo leaks tool residue; gitignore non-Claude install dirs if unavoidable

## Test infrastructure

- `tests/helpers/ports/` — in-memory port implementations for unit mocking
- `tests/fixtures/` — local fixture directory (never mutate; copy before use)
