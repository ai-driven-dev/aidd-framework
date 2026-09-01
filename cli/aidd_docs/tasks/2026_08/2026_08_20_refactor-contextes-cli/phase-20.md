---
status: pending
---

# Instruction: Make the tests prove they test something

Every net in this refactor answers "did the behaviour change?". None answers "would the tests notice
if it did?". Mutation testing is that second question, and it is the only one that measures a test
suite rather than the code.

It is placed last on purpose: it is worth running against the structure the refactor produces, not
against the one it replaces.

## Ce que cette phase n'est pas

La réparation de Stryker appartient à la phase 9, et son premier usage à la phase 14, qui a besoin
d'une mesure avant et après le découpage du Manifest. Ici, la campagne est large : elle mesure la
suite entière contre la structure que le refactor a produite.

## What is in the way

Stryker is installed and broken. It was already broken before this refactor, silently, which is part
of how the drift went unnoticed. Two failures were met, in order:

1. `ts.parseConfigFileTextToJson is not a function` — a TypeScript upgrade broke Stryker's config
   reader. Fixed with `tsconfigFile: ""`.
2. Its runner picks up `vitest.workspace.ts`, so it runs the e2e project, and the build golden fails
   inside Stryker's sandbox. `vitest.dir`, `vitest.related` and a dedicated config were each tried;
   none narrowed the initial run.

The second may have changed since: the e2e helper now strips drivable tool binaries from `PATH` and
reaches node through `process.execPath`, so the golden no longer depends on what the machine has
installed — which was part of why it could not survive a sandbox. Re-measure before re-diagnosing.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── stryker.config.json          ✏️ modify (a runner that sees unit tests only)
    └── .github/workflows/           ✏️ modify (a scored run, not a gate that blocks a merge)
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    stryker runs at all, on one file => the harness is alive again: 5: system
  section Happy path
    mutate the manifest aggregate => surviving mutants name untested behaviour: 5: system
  section Edge case - a mutant nobody kills
    a surviving mutant is either covered by a new test or recorded as accepted: 1: system
  section Teardown
    the score is written down => the next run has something to compare against: 5: system
```

## Tasks to do

### `1)` Bring the runner back to life

1. Point Stryker at the unit project only. The e2e and golden suites spawn a built binary and are
   worthless as mutation oracles anyway: they would be slow, and a surviving mutant there would say
   nothing about a unit's design.

### `2)` Mutate what carries the rules

1. Start with the manifest aggregate and the tool profiles: they hold the invariants everything else
   assumes, and they are pure, so a mutant that survives there is a real gap and not a wiring
   artefact.

### `3)` Turn the survivors into a decision

1. Each surviving mutant is either killed by a test that was missing, or written down as accepted
   with the reason. No silent list.
2. Record the score so the next run compares rather than restarts.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1    | `stryker run` completes on the unit project without touching the golden or e2e suites |
| 2    | The manifest aggregate and the tool profiles are mutated, with a score recorded |
| 3    | Every surviving mutant is killed or accepted in writing; the score is committed so the next run has a baseline |
| all  | Mutation is scored, never a gate: it reports on the suite, it does not block a merge |
