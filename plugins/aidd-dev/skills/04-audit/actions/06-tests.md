# 06 - Test value

Audit whether tests protect meaningful risks at a proportionate cost. Coverage percentage is not the goal. Read-only.

## Input

Test code, production behavior, fixtures, mocks, test configuration, CI history, and existing coverage or timing artifacts.

## Output

`07-tests-value.md`, following `../assets/audit-template.md`.

## Questions

- Which user or system risk does each important test group protect?
- What plausible regression would make it fail?
- Which tests can stay green while the claimed behavior is broken?
- Which tests duplicate cheaper protection or cost more than their unique signal?
- Which critical behavior has no effective witness?

## Process

1. Read the audit contract, question protocol, and Test value pack.
2. Start from critical code paths and risks, then map the tests that claim to protect them.
3. Inspect assertions, mocks, fixtures, timing dependencies, skips, snapshots, and overlap. Do not classify from filenames alone.
4. Classify material groups as `protective`, `redundant`, `brittle`, `ceremonial`, or `misleading`.
5. Compare signal with runtime, flake, fixture complexity, duplication, and maintenance cost.
6. Recommend `delete` only when no distinct protected risk remains beyond a cheaper test. Otherwise prefer `keep`, `rewrite`, `merge`, or `unknown`.
7. Do not run E2E. Use existing CI, coverage, timing, and flake evidence; do not generate new coverage by default.
8. Report at most five highest-leverage findings.

## Test

- Every finding names protected risk, plausible regression, signal failure, and cost.
- Coverage percentage alone never produces a finding.
- A delete recommendation proves the absence of unique protection.
- Critical untested behavior cites the production path and missing effective witness.
