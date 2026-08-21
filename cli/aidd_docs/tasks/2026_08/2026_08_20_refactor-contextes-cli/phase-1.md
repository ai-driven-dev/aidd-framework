---
status: pending
---

# Instruction: Extend the golden net

The sixteen phases that follow are only verifiable if a behavior snapshot covers the surface they
touch. Today `snapshots/phase0/snapshot.json` holds **five invocations** — `setup`, `status`,
`restore --force`, `clean --force`, `status` — while the test's own docstring claims "each public
CLI command". Nothing else in this plan is safe until that gap closes.

`captureMatrix` runs commands **sequentially in one project directory**. It is a scenario, not a
list of independent invocations: state accumulates and `clean --force` is terminal. Extending it is
a scenario design.

Already normalized: absolute paths, the built-cache directory, version strings, CRLF, and manifest
file hashes recomputed over normalized content. Already covered elsewhere: `framework build`, whose
own golden spans the nine target/mode cells.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/tests/golden/
    ├── golden-baseline.e2e.test.ts   ✏️ modify (honest docstring, extended scenario, error scenario)
    └── snapshots/phase0/
        └── snapshot.json             ✏️ modify (recaptured with UPDATE_GOLDEN=1)
```

## User Journey

```mermaid
flowchart TD
  A[A contributor changes the CLI] --> B{Does the snapshot move?}
  B -->|No| C[The change is behavior-neutral]
  B -->|Yes| D[The diff shows exactly what changed]
  D --> E[Reviewer accepts or rejects that behavior change]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    create a temp project and a fake home => hermetic project directory: 5: system
    point setup at the local framework fixture => no network involved: 5: system
  section Happy path
    run setup then doctor, marketplace list, plugin list => each invocation recorded: 5: cli
    install the local aidd-test plugin then list again => catalog and manifest recorded: 5: cli
    install a second tool then read status => two equipped tools recorded: 5: cli
    remove the plugin then clean the project => teardown path recorded: 5: cli
  section Edge case - drifted project
    a tracked file is overwritten => run status and doctor => drift reported in both: 1: cli
    the same drift => run restore --force then status => project back in sync: 1: cli
  section Edge case - no manifest
    a directory was never set up => run doctor and status => non-zero exit with a clear message: 1: cli
  section Edge case - malformed catalog
    the marketplace-malformed fixture => add it as a marketplace => non-zero exit naming the file: 1: cli
  section Teardown
    capture twice in a row => the two snapshots are byte-identical: 5: system
```

## Tasks to do

### `1)` Make the docstring honest

> The file must not promise more than it holds.

1. Replace "Each public CLI command is exercised" with what it does: one scenario over a hermetic
   fixture project, plus an error scenario.
2. Name what it deliberately leaves out — see task 6.

### `2)` Extend the main scenario

> Keep the existing order; insert around it.

1. After `setup`, capture `doctor`, `marketplace list` and `plugin list` on the fresh project.
2. Capture `plugin install aidd-test`, then `plugin list` again. The fixture serves it from
   `./plugins/aidd-test`, a local source, so this stays offline.
3. Capture a second tool install, then `status` with two tools equipped.
4. Capture `plugin remove aidd-test` before the existing `restore --force`.
5. Leave `clean --force` and the post-clean `status` last: `clean` ends the scenario.

### `3)` Capture drift

> The mechanism `status` and `doctor` share is the one never captured.

1. Between two captures, overwrite one tracked file with fixed content. It is not a command, so it
   produces no entry; its effect shows in the next one.
2. Capture `status` and `doctor` on the drifted project.
3. Capture `restore --force`, then `status` again.

### `4)` Add an error scenario in a second directory

> `clean --force` is terminal, so error paths need their own project.

1. Capture `doctor` and `status` on a directory with no manifest.
2. Capture a plugin install with no marketplace registered.
3. Capture a marketplace add pointing at `tests/fixtures/framework/marketplace-malformed`.
4. Capture an unknown tool id and an unknown command.
5. Prefix each entry's `command` with its scenario so both live in one snapshot file.

### `5)` Prove the capture is deterministic

> Reproducible at capture time is not the same as stable.

1. Capture twice in a row and compare byte for byte.
2. Inspect the new entries for values `normalize()` does not handle. Timestamps are the likely leak,
   since marketplace entries carry `addedAt` and `lastFetched`. Extend `normalize()` rather than
   dropping the field.
3. Run the suite twice without `UPDATE_GOLDEN`.

### `6)` Record what stays out of reach

> An honest net names its holes.

1. In the docstring, one line each: anything hitting the network, anything interactive, and
   `framework build`, covered by its own golden.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1, 6 | The docstring describes what the file covers and names what it does not; no claim exceeds the content |
| 2    | The snapshot holds an entry for `doctor`, `marketplace list`, `plugin list`, `plugin install`, `plugin remove` and a second tool install, on top of the existing five |
| 3    | The snapshot holds a `status` and a `doctor` taken on a drifted project, and a `status` after `restore --force` showing it back in sync |
| 4    | The snapshot holds at least four entries with a non-zero exit code, captured in a directory the main scenario never touched |
| 5    | Two consecutive captures are byte-identical, two consecutive verification runs pass, and no absolute path, version string or timestamp survives in the snapshot |
| all  | The snapshot diff of this phase is pure addition: no existing entry changes. If one does, the capture is not deterministic and task 5 is unfinished |
