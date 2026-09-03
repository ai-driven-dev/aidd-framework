---
objective: "Build the coverage safety net that US-E8-02, US-E8-03 and US-E8-04 need before their refactors touch install and restore code."
status: done
---

# SPIKE-E8-01: install/restore coverage

Baseline confirmed before any change: 2118 passing tests (`pnpm test`, 196 files). After this spike: 2136 passing tests (197 files, 18 new), zero failures.

## Coverage, before / after

| File | Branch before | Branch after | Stmt before | Stmt after | Needed by |
| --- | ---: | ---: | ---: | ---: | --- |
| `shared/restore-regular-files-use-case.ts` | 72.7% | **100%** | 42.7% | **100%** | US-E8-04 (blocking) |
| `install/install-agents-use-case.ts` | 88.2% | 94.7% | 95.7% | 100% | US-E8-02 |
| `install/install-commands-use-case.ts` | 88.9% | 94.4% | 100% | 100% | US-E8-02 |
| `install/install-rules-use-case.ts` | 87.5% | 94.4% | 95.0% | 100% | US-E8-02 |
| `install/install-skills-use-case.ts` | 88.9% | 94.4% | 100% | 100% | US-E8-02 |
| `shared/restore-merge-files-use-case.ts` | 96.6% | 96.6% | 100% | 100% | US-E8-04 (already fine, untouched) |
| `global/update-ai-tools-use-case.ts` | 100% | 100% | 100% | 100% | US-E8-03, nothing to do |
| `global/update-ide-tools-use-case.ts` | 100% | 100% | 100% | 100% | US-E8-03, nothing to do |

Measured with `vitest --coverage` over `unit` + `integration`, `--coverage.reporter=json-summary`, scoped per file via `--coverage.include`. Numbers match the task brief's baseline exactly, confirmed before writing any test.

US-E8-03 needs no new coverage. Both `update-ai-tools-use-case.ts` and `update-ide-tools-use-case.ts` were already at 100%/100% before this spike and remain there. No test file was touched for either.

## Priority 1: RestoreRegularFilesUseCase

No dedicated test file existed anywhere in the repo for this class. Its 42.7% statement coverage was incidental, leaking in from `restore-use-case.unit.test.ts`, which only exercises it indirectly through the full `RestoreUseCase` (and the fixture files that test uses never hit several paths directly).

New file: `tests/application/use-cases/shared/restore-regular-files-use-case.unit.test.ts`, 10 tests, instantiating `RestoreRegularFilesUseCase` directly against `buildUnitDeps`'s in-memory `fs` and `DeterministicHasher`, with `KeepPrompter` / `OverwritePrompter` / `ScriptedPrompter` from the existing prompter fakes.

Covered:
- drift kind "deleted" (file absent from disk) restoring from the dist map, without prompting and without `--force`.
- drift kind "modified" (disk content differs from the manifest hash), across all three decision modes: `force=true` (no prompt), `interactive=true` with the prompter choosing keep, `interactive=true` with the prompter choosing overwrite, and neither force nor interactive (throws `InputRequiredError`, and the file is left untouched by the throw).
- the restored/kept partition within a single call, using a scripted prompter with two files that get different answers in the same `execute()`.
- `fileFilter` honoured (excludes a file from drift collection entirely, so it is never even considered restored or kept) versus `fileFilter: null` (all manifest files considered).
- `execute()` returning `null` when nothing has drifted.
- two edge cases not named in the task brief but present in the uncovered line ranges: a manifest-tracked file that drifts (deleted or modified) but has no corresponding entry in the dist map is silently dropped, not restored, not kept, no error. See "Suspicious behaviour" below.

Result: 100% branches, 100% statements (up from 72.7% / 42.7%), exceeding the story's ask.

### Mutation evidence

Two mutations applied to production code, one test run each, then reverted (confirmed via `git diff src/` returning empty afterward):

1. `restore-regular-files-use-case.ts`, `applyRestorations`: inverted `if (skip)` to `if (!skip)`, which swaps which files land in `restored` versus `kept`. Result: 6 of 10 tests failed (all four decision-mode tests, the fileFilter test, and the multi-file partition test).
2. `resolve-restore-decision.ts`: inverted `if (!force && !interactive)` to `if (force && !interactive)`, which flips when the non-interactive/non-force gate throws `InputRequiredError`. Result: 3 of 10 tests failed (the throw test itself, the force=true test, and the fileFilter test, which also runs in force mode).

Both mutations were caught, confirmed failing, then reverted and confirmed green again (10/10 pass, `git diff src/` empty).

## Priority 2: the four install content use-cases

All four (`install-agents`, `install-rules`, `install-commands`, `install-skills`) share the same `processFile` skeleton: `startsWith` directory check, `acceptsFileName`, an `entryFile` gate, `buildInstallPath`, then a `.gitkeep` special case. Confirmed identical structure by diffing the four files directly, not by assumption.

Pulled the exact missing branch line numbers from `coverage-final.json` per file (not just the summary) before writing anything:

| File | Missing branch lines | What they are |
| --- | --- | --- |
| `install-agents-use-case.ts` | 43, 48 | `entryFile !== null` gate never entered; `buildInstallPath` returning `null` never hit |
| `install-rules-use-case.ts` | 40, 45 | same two, rules had no `entryFile` test at all |
| `install-commands-use-case.ts` | 41, 45 | `entryFile` gate was already covered by an existing test; `buildInstallPath === null` was not |
| `install-skills-use-case.ts` | 41, 45 | `entryFile` gate already covered (both directions); `buildInstallPath === null` was not |

What was added:
- `install-agents-use-case.unit.test.ts` and `install-rules-use-case.unit.test.ts`: a new `entryFile`-set `ContentSection` plus two tests each (accepts the matching basename, filters out a mismatching one), matching the pattern the `install-skills` test file already used for its own `entryFile` coverage. `install-commands-use-case.unit.test.ts` already had an equivalent test (`"respects entryFile filter when section has an entryFile"`); left it untouched.
- All four files: one new test using the `copilot` tool config (imported alongside `claude`) installing a `.gitkeep` file. Claude's `buildInstallPath` never returns `null`, so claude's existing `.gitkeep` test always takes the "empty-content `InstallationFile`" branch. Copilot's `agentsHandler` / `rulesHandler` / `commandsHandler` / `skillsHandler.buildFilePath` all explicitly `return null` when the basename is `.gitkeep` (checked in `src/domain/tools/ai/copilot.ts`), which is a real, reachable path to the `outputPath === null` branch and a genuine behavioural difference between tools: with `claude`, a tracked `.gitkeep` produces an empty `InstallationFile`; with `copilot`, it is filtered out of the result entirely. Pinned as-is; not a bug, just an asymmetry the US-E8-02 generalisation needs to preserve.
- Confirmed the documented asymmetry: `InstallAgentsUseCase.execute` calls `cap.acceptsFileName(relativeFileName, ALL_TOOL_SUFFIXES)` with the extra `ALL_TOOL_SUFFIXES` argument the other three don't pass. This was already exercised by the existing "filters out agent files for other tools" test (unchanged); the new `entryFile` and `.gitkeep` tests for agents go through the same call site, so the asymmetric signature stays exercised under the new cases too.

Result per file: statements 100% (up from 95.0-100%), branches 94.4-94.7% (up from 87.5-88.9%).

### Remaining uncovered branch (dead code, not pursued)

Every one of the four files has this line inside `processFile`:

```ts
const basename = relativeFileName.split("/").at(-1) ?? relativeFileName;
```

The `?? relativeFileName` fallback is unreachable: `String.prototype.split` always returns an array with at least one element, so `.at(-1)` on its result is only ever `undefined` if the array were empty, which cannot happen. No test input can trigger this branch. It is the one remaining branch miss in all four coverage-after numbers above (1 out of 18-19 branches per file). Reported here rather than forced with a fake test, per the characterization-only rule: pinning a branch that cannot execute would mean asserting nothing real.

## Suspicious behaviour found, deliberately pinned rather than fixed

In `RestoreRegularFilesUseCase.collectDrift`, when a manifest-tracked file has drifted (deleted from disk, or modified on disk) but has no corresponding entry in `distMap`, the drift is silently dropped: nothing is pushed to the `drift` array, so the file appears in neither `restored` nor `kept`. If it was the only file being restored, `execute()` returns `null`, i.e. "nothing to restore", indistinguishable from the file never having drifted at all. No error, no log, no indication that a tracked file is out of sync with no way to reconcile it. Two tests pin this exact behaviour (`"silently drops a deleted file..."` / `"silently drops a modified file..."`). Whether this is intended (dist map legitimately doesn't have every manifest entry in some scenario) or a gap worth surfacing to the user is a product question, not something this spike should decide by asserting different behaviour.

## Verification

- `npx tsc --noEmit`: no errors.
- `pnpm test`: 197 files, 2136 tests, 0 failures (2118 baseline + 18 new).
- Biome (`./node_modules/.bin/biome check --write <file>`, one file at a time): all 5 changed/new files report "No fixes applied" (one auto-fix applied to the new restore-regular-files test file's import wrapping, confirmed clean on the following run).
- Mutation testing on the blocking file: see "Mutation evidence" above.
