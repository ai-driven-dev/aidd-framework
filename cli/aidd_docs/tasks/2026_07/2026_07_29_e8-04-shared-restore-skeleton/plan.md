---
objective: Extract the shared collect-drift/decide/partition skeleton out of RestoreRegularFilesUseCase and RestoreMergeFilesUseCase, keeping the whole-file-write vs per-key-merge leaf separate.
status: implemented
---

# Shared restore skeleton

## Difference table (before the change)

| Aspect | RestoreRegularFilesUseCase | RestoreMergeFilesUseCase |
|---|---|---|
| Constructor | `(fs: FileReader & FileWriter, prompter: Prompter)` | `(fs: FileReader & FileMerger, hasher: Hasher, prompter: Prompter)` |
| Input shape | `manifestFiles: {relativePath, hash}[]` | `mergeFiles: MergeFileEntry[]` (`{relativePath, sectionKey, entries: Record<string, FileHash>}`) |
| Drift detection | Compare disk file's whole-content hash to the manifest-recorded hash | Compare each tracked key's hash (via `extractMergeEntries`, JSON-parsed and per-key hashed) to the manifest-recorded per-key hash; drift if any key differs |
| Drift source method | `collectDrift` (single loop over manifest files) | `collectMergeDrift` calling `checkOneMergeFileDrift` calling `checkModifiedDrift` (three methods) |
| Decision call | `new ResolveRestoreDecisionUseCase(this.prompter).execute(...)`, instantiated inside the loop | Same call, same instantiate-inside-loop pattern |
| Partition loop | `applyRestorations`: loop over drift, skip or apply, push to `restored`/`kept` | `applyMergeRestorations`: identical shape, same push pattern |
| Restore action (I/O leaf) | `fs.writeFile(path, content)`, replaces the whole file, then re-hashes | `fs.mergeJsonFile(path, content, mergeStrategy)`, merges per key per `MergeStrategy`, then re-extracts per-key hashes into a fresh `MergeFileEntry` |
| Result shape | `{restored, kept, updatedFiles: InstallationFile[]}` built from a hash map | `{restored, kept, updatedMergeFiles: MergeFileEntry[]}` built from a map of `MergeFileEntry` |
| `fileFilter` option | Present, applied in `collectDrift` | Present, applied in `collectMergeDrift` |

The literally duplicated code was the partition loop: instantiate `ResolveRestoreDecisionUseCase`,
iterate drift entries, call `.execute()` with the same four fields, branch on the boolean result,
push into `restored`/`kept`. `collectDrift` vs `collectMergeDrift` are conceptually parallel but
mechanically different (single hash compare vs per-key JSON compare), so they were left as
leaf-owned methods, not folded into the shared skeleton, because there is no line-for-line
duplication between them beyond the `fileFilter` early-continue, which is too small to be worth
extracting on its own.

## Decisions

| Decision | Why |
|---|---|
| New file `restore-drift-entries-use-case.ts` exports `RestoreDriftEntriesUseCase` and a `RestoreDriftLeaf<TDrift, TResult>` interface | Names the responsibility ("restore a batch of drift entries"), not the mechanism. The leaf interface has three methods: `collectDrift()`, `restore(entry)`, `buildResult(restored, kept)`. |
| The skeleton is injected via **composition**, not a base class | The previous ticket (`refactor(cli): update ai and ide tools through one implementation`, PR #553) used inheritance and drew reviewer pushback for it. Each restore use-case builds its own `RestoreDriftEntriesUseCase` instance in its constructor and hands it a leaf object at `execute()` time. No shared base class, no `extends`. |
| `RestoreDriftEntriesUseCase` owns exactly one `ResolveRestoreDecisionUseCase` construction site, built once in its own constructor | The original code built a new `ResolveRestoreDecisionUseCase` on every loop iteration, in two separate files, two separate call sites. Now there is exactly one place in the codebase that constructs it (`grep -rn "new ResolveRestoreDecisionUseCase" src/` returns one hit), and it happens once per skeleton instance rather than once per entry. At runtime there are still two instances, one per restore use-case, each holding its own `RestoreDriftEntriesUseCase`. The thing that became singular is the code path that decides skip/overwrite, not a process-wide singleton object. |
| The leaf's `restore(entry)` method is the only place that writes anything | `RestoreRegularFilesUseCase.execute` builds a leaf whose `restore` calls `fs.writeFile` (whole-file replace); `RestoreMergeFilesUseCase.execute` builds a leaf whose `restore` calls the unmodified `applyOneMergeRestore` (`fs.mergeJsonFile`, per-key). The skeleton's `execute<TDrift, TResult>()` never inspects `entry` beyond `relativePath`/`reason` and never branches on which leaf it is running. There is no `if (kind === "merge")` anywhere in the shared file. |
| `collectDrift`, `checkOneMergeFileDrift`, `checkModifiedDrift`, `buildDriftEntry`, `applyOneMergeRestore` stay as private methods on their original class | They differ mechanically (whole-file hash vs per-key JSON hash comparison) and were never literally duplicated between the two files, so extracting them would relocate complexity rather than remove duplication. |
| No `as`/`as unknown as`/`any` anywhere | TypeScript's generic inference on `RestoreDriftEntriesUseCase.execute<TDrift, TResult>(leaf, force, interactive)` resolves both type parameters from the object literal passed at each call site. No cast was needed. Confirmed by `tsc --noEmit`. |
| Both classes' public constructors and `execute()` signatures are byte-identical to before | `RestoreRegularFilesUseCase(fs, prompter)` and `RestoreMergeFilesUseCase(fs, hasher, prompter)` are unchanged, so `restore-tool-files-use-case.ts` (the only call site, found by grepping `RestoreRegularFilesUseCase`/`RestoreMergeFilesUseCase` across `src/` and `tests/`) needed no edits. `deps.ts` does not reference either class directly, confirmed by grep. |

## Checked fact: partial-key merge still merges only the intended keys

New test `merges only the drifted tracked key, leaving an undrifted tracked key and an untracked
key untouched` in `tests/application/use-cases/shared/restore-merge-files-use-case.unit.test.ts`:

- Disk holds `{toolPath: "/usr/local/old-tool", timeout: 30, sideNote: "keep-me"}`.
- The manifest recorded `toolPath` as `"/usr/local/expected-tool"` (so it drifted) and `timeout` as
  `30` (so it did not drift). `sideNote` is not part of the framework distribution at all.
- The merge strategy is per-key: `{default: "user-prime", frameworkOverrideKeys: ["toolPath"]}`.
- After restore: `toolPath` becomes `"/usr/local/new-tool"` (framework-owned key, synced),
  `timeout` stays `30` (user-prime, untouched), and `sideNote` stays `"keep-me"`, which proves the
  merge leaf never replaces the whole file the way the regular leaf does.

Result verified by running this test: **PASS**. This pins unchanged production behavior
(`mergeJsonFile` / `mergePerKey` were not touched); the test exists as this refactor's guardrail,
so a future regression that collapses the merge leaf into a whole-file write would fail it.

Note: the strategy shape used in this test, `{default: "user-prime", frameworkOverrideKeys: [...]}`,
is not used by any current production tool config (`src/domain/tools/` only uses the plain
`"user-prime"`, `"framework-prime"`, and `"none"` strings). It is the shape that makes "only the
keys that drifted get merged" literally true; a plain `"framework-prime"` strategy would resync
every framework-managed key on any drift, not just the one that drifted, which is also correct
existing behavior but does not demonstrate the same guardrail as cleanly.

## Verification

1. `npx tsc --noEmit`: no errors.
2. `pnpm test` from `cli/`: **2144 passed, 0 failed** (198 test files). Baseline was 2136. The 8 new
   tests are in the new `restore-merge-files-use-case.unit.test.ts` file. No existing assertion was
   modified.
3. Biome, one file at a time, each reporting "No fixes applied":
   - `src/application/use-cases/shared/restore-drift-entries-use-case.ts`
   - `src/application/use-cases/shared/restore-regular-files-use-case.ts`
   - `src/application/use-cases/shared/restore-merge-files-use-case.ts`
   - `tests/application/use-cases/shared/restore-merge-files-use-case.unit.test.ts`
4. Mutation test: inverted the `if (skip)` branch to `if (!skip)` inside
   `RestoreDriftEntriesUseCase.execute`. Re-ran the full suite (through `rtk proxy npx vitest run`,
   needed because the standard reporter wrapper failed to parse output for this particular run; the
   proxy path bypasses the wrapper and prints the real vitest report). Result: **20 tests failed
   across exactly 3 files**:
   - `tests/application/use-cases/shared/restore-regular-files-use-case.unit.test.ts`, 6 failures, regular path
   - `tests/application/use-cases/shared/restore-merge-files-use-case.unit.test.ts`, 5 failures, merge path
   - `tests/application/use-cases/restore-use-case.unit.test.ts`, 9 failures, both paths exercised together through `RestoreUseCase`/`RestoreToolFilesUseCase`
   Both the regular and the merge path failed, confirming the extraction is genuinely shared rather
   than duplicated behind a common name. Reverted the mutation; full suite back to 2144/2144 passed
   (re-confirmed with `pnpm test`, which runs `pnpm build && vitest run`).
5. Grepped `RestoreRegularFilesUseCase`, `RestoreMergeFilesUseCase`, `ResolveRestoreDecisionUseCase`
   across `src/` and `tests/`: the only construction site for both restore classes is
   `src/application/use-cases/restore/restore-tool-files-use-case.ts`, unchanged; `deps.ts` does not
   reference either class directly; `new ResolveRestoreDecisionUseCase` appears exactly once in
   `src/`, inside `restore-drift-entries-use-case.ts`.
