---
status: done
---

# Instruction: Lock the workflow contract

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
├── scripts/
│   └── __tests__/
│       └── cli-ci-gate-covers-every-job.test.js  ✏️ assert promotion reuse and required-gate coverage
└── aidd_docs/
    └── memory/
        └── deployment.md  ✏️ describe promotion-specific mutation reuse
```

## User Journey

```mermaid
flowchart TD
  A[system: workflow configuration changes] --> B[static workflow contract test]
  B --> C{promotion safety and gate fan-in hold?}
  C -- yes --> D[CI configuration is valid]
  C -- no --> E[descriptive test failure]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    CI workflow YAML and its contract test => workflow parsed: 5: system
  section Happy path
    run the workflow contract test => trusted promotion, fallback, retained merge checks, and gate wiring are asserted: 5: system
  section Edge case - future job
    add an ungated job => gate-coverage test fails: 5: system
```

## Tasks to do

### `1)` Assert promotion safety structurally

> Make regressions in the promotion fast path visible before merge.

1. Extend the existing workflow contract test with the trusted-promotion and fallback invariants.
2. Assert a trusted promotion empties only mutation scopes and retains the existing gate fan-in.

### `2)` Record the operating model

> Keep deployment memory aligned with the workflow.

1. Replace the generic CLI CI description with its promotion reuse rule and fail-closed fallback.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | The contract test fails if trusted promotion detection, mutation fallback, retained checks, or gate fan-in is removed. |
| 2 | Deployment memory accurately states when promotion skips mutations and what still runs. |
