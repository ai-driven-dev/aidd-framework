# 01 - Capture Golden Baseline

Record the current passing state as the immutable reference point before any file is touched.

## Inputs

- `target-layer-path` (required) - the directory being audited (e.g. `src/contexts/tools/domain/formats/`)
- `layer-skill` (required) - the authoritative skill name (e.g. `tools`)

## Outputs

- Confirmed passing test run (all tests green, build succeeds, typecheck exits 0)
- A noted baseline state that the gate in action 04 will compare against

## Process

1. Confirm the working tree is clean in the target layer: `git status <target-layer-path>`.
   If the tree is dirty (uncommitted changes), stop and report — do not proceed with an
   unclean baseline. Stash or commit any unrelated work first.
2. Run the full test suite and confirm it exits 0. Record the test file count and test count.
3. Run typecheck and confirm it exits 0.
4. Run the build and confirm it exits 0.
5. Record the baseline in the task log:
   - Target layer path
   - Layer skill name
   - Test count at baseline
   - Build status

## Test

All three commands (`typecheck`, `test`, `build`) exit 0 — this is the non-negotiable entry
condition. Do not proceed to action 02 if any command fails at baseline.
