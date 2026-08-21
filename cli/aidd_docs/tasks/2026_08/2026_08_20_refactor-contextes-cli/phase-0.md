---
status: todo
---

# Instruction: Extend the golden net before anything moves

The eight relocation phases are only verifiable if a behavior snapshot covers the surface
they touch. Today `snapshots/phase0/snapshot.json` holds **five invocations** — `setup`,
`status`, `restore --force`, `clean --force`, `status` — while the test's own docstring
claims "each public CLI command". Nothing else in the plan is safe until this is fixed.

## What the existing test actually is

`captureMatrix` runs commands **sequentially in one project directory**. It is a scenario,
not a list of independent invocations: state accumulates, and `clean --force` is terminal.
Any extension is a scenario design, not a list of commands to append.

Already normalized: absolute paths, the built-cache dir, version strings, CRLF, and manifest
file hashes (recomputed over normalized content so CI and local machines agree).

Already covered elsewhere, do not duplicate: `framework build` has its own golden over the
nine target/mode cells (`framework-build-golden.e2e.test.ts`).

## Architecture projection

> ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/tests/golden/
    ├── golden-baseline.e2e.test.ts        ✏️ modify (honest docstring, extended scenario, error scenario)
    └── snapshots/phase0/
        └── snapshot.json                  ✏️ modify (recaptured, UPDATE_GOLDEN=1)
```

## Tasks to do

### `1)` Make the docstring honest

1. Replace "Each public CLI command is exercised" with what the file does: a scenario over a
   hermetic fixture project, plus an error scenario.
2. State the two things it deliberately does not cover — see task 6.

### `2)` Extend the main scenario

Keep the existing order where it is; insert around it. The fixture marketplace
(`tests/fixtures/framework/.claude-plugin/marketplace.json`) offers `aidd-test` at
`./plugins/aidd-test`, a **local** source, so plugin commands stay offline and deterministic.

1. After `setup`: `doctor`, `marketplace list`, `plugin list` (empty).
2. `plugin install aidd-test`, then `plugin list` (one entry).
3. `ai install cursor` — a second tool from bundled assets, then `status` with two tools.
4. Before `restore --force`: `plugin remove aidd-test`.
5. Keep `clean --force` and the post-clean `status` last: `clean` ends the scenario.

### `3)` Capture drift — the real gap

Nothing in the current snapshot ever shows a **modified** tracked file, yet drift detection is
the mechanism `status` and `doctor` share (`detect-plugin-drift`, called by both), and the one
the refactor touches most.

1. Add a mutation step between captures: overwrite one tracked file with fixed content.
   It is not a command, so it produces no entry; its effect appears in the next capture.
2. Capture `status` and `doctor` on the drifted project.
3. Capture `restore --force`, then `status` again — back in sync.

### `4)` Add an error scenario, in a second project directory

`clean --force` is terminal, so error paths need their own directory.

1. `doctor` and `status` on a directory with no manifest.
2. `plugin install aidd-test` with no marketplace registered.
3. `marketplace add` pointing at `tests/fixtures/framework/marketplace-malformed`.
4. An unknown tool id, and an unknown command.
5. Prefix each entry's `command` with its scenario so both live in one snapshot file.

### `5)` Prove the capture is deterministic

1. Capture twice in a row; the two snapshots must be byte-identical.
2. Inspect the new entries for values `normalize()` does not yet handle — timestamps are the
   likely leak, since marketplace entries carry `addedAt` and `lastFetched`. Extend
   `normalize()` rather than dropping the field.
3. Run the suite twice without `UPDATE_GOLDEN` to confirm it is stable, not just reproducible
   at capture time.

### `6)` Record what stays out of reach

In the docstring, and in one line each: anything hitting the network (`marketplace add` on a
GitHub source, `self-update`, the update check), anything interactive (the menu, prompts), and
`framework build`, covered by its own golden.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1, 6 | The docstring describes what the file covers and names what it does not. No claim exceeds the content. |
| 2    | The snapshot contains an entry for each of `doctor`, `marketplace list`, `plugin list`, `plugin install`, `plugin remove`, `ai install`, on top of the existing five. |
| 3    | The snapshot contains a `status` and a `doctor` taken on a drifted project, and a `status` after `restore --force` showing the project back in sync. |
| 4    | The snapshot contains at least four entries with a non-zero exit code, captured in a directory the main scenario never touched. |
| 5    | Two consecutive captures are byte-identical. Two consecutive verification runs pass. No absolute path, version string or timestamp survives in the snapshot. |
| all  | `pnpm test:e2e` passes. The snapshot diff of this phase is reviewed on its own: it is the last time the baseline changes without a behavior change behind it. |

## Why this phase is a scope change, not a neutral move

It recaptures the snapshot, so by the plan's own rule it is a scope batch and its diff is the
review. It is also the only such batch whose diff should be **pure addition** — no existing
entry may change. If one does, the capture is not deterministic and task 5 is not done.
