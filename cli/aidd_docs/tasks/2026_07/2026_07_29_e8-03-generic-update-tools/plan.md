---
objective: Collapse UpdateAiToolsUseCase and UpdateIdeToolsUseCase, two line-for-line identical fan-out use-cases, into one generic implementation parameterized by tool-ID type and predicate.
status: implemented
---

# Generic update-tools fan-out

## Background

`update-ai-tools-use-case.ts` and `update-ide-tools-use-case.ts` (both 81 lines) were diffed
line by line before writing anything. They were identical in every respect except three:

1. The ID type: `AiToolId` vs `IdeToolId`.
2. The predicate used to filter installed tool IDs when no explicit `toolArg` is given:
   `isAiToolId`, imported from `domain/models/tool-ids.js`, vs `isIdeToolId`, imported from
   `domain/tools/registry.js` — different source modules, not just different names.
3. The exported names: `UpdateAiToolsInput`/`Result`/`UseCase` vs the Ide equivalents.

Everything else — the `execute()` body, `resolveTargetIds`, `updateTargets`, the
`BulkConflictState` construction, the constructor injection order — was byte-identical.

## What was extracted

A new generic class `UpdateToolsUseCase<T extends ToolId>` in
`src/application/use-cases/global/update-tools-use-case.ts` holds the entire orchestration.
It takes the predicate as a fourth constructor argument:

```ts
constructor(
  private readonly manifestRepo: ManifestRepository,
  private readonly versionReader: VersionReader,
  private readonly updateOneToolUseCase: UpdateOneToolUseCase,
  private readonly isTargetToolId: (id: string) => id is T
) {}
```

`resolveTargetIds` calls `manifest.getInstalledToolIds().filter(this.isTargetToolId)` —
exactly the call shape the two originals already used (`.filter(isAiToolId)` /
`.filter(isIdeToolId)|`), just with the predicate coming from a field instead of a
module-level import. No `category: "ai" | "ide"` string exists anywhere in the class; there
is nothing to branch on.

`update-ai-tools-use-case.ts` and `update-ide-tools-use-case.ts` were kept, but reduced to
thin subclasses:

```ts
export class UpdateAiToolsUseCase extends UpdateToolsUseCase<AiToolId> {
  constructor(manifestRepo, versionReader, updateOneToolUseCase) {
    super(manifestRepo, versionReader, updateOneToolUseCase, isAiToolId);
  }
}
```

Each file also re-exports `UpdateAiToolsInput`/`Result` (and the Ide equivalents) as type
aliases over the generic `UpdateToolsInput<T>`/`UpdateToolsResult`, so nothing downstream
needs to know the generic type exists.

## Decisions

| Decision | Why |
|---|---|
| Generic base class + subclassing, not a `category` field | The story explicitly forbids branching control flow on a category string. Subclassing fixes the type parameter and predicate at construction, so there is no runtime branch at all — the two categories never meet inside one code path. |
| Predicate injected via constructor, not resolved from a lookup table keyed by category | Matches the existing call shape (`.filter(isAiToolId)`) exactly and keeps the generic class free of any knowledge that "ai" and "ide" exist. |
| Old classes kept as subclasses rather than deleted | Every construction site (`deps.ts`) and every test file constructs `new UpdateAiToolsUseCase(manifestRepo, versionReader, updateOneToolUseCase)` with exactly 3 arguments. Subclassing preserves that exact constructor shape, so `deps.ts` and both existing test files needed zero changes — no wiring, no test edits, no risk of touching an assertion. |
| Generic file placed in `global/` next to its two subclasses, not in `shared/` | Precedent in this codebase: `InstallContentSectionUseCase` (a comparable generic engine used by 4 sibling use-cases) lives in `install/` alongside its callers, not in `shared/`. `shared/` in this codebase is reserved for logic reused across *different* top-level directories (e.g. `update-one-tool-use-case.ts`, `resolve-update-decision-use-case.ts`). The generic update-tools engine is only ever used by its two `global/` subclasses, so it stays in `global/`. |
| No new tests written | Both originals were already at 100% branch/statement coverage; the existing test suites for `UpdateAiToolsUseCase` and `UpdateIdeToolsUseCase` exercise the generic class transitively through the subclasses. Coverage was re-measured after the refactor (see Verification) to confirm the claim rather than assume it. |

## BulkConflictState scoping — checked, not assumed

The story's hard requirement: `BulkConflictState` must stay scoped per invocation of
`execute()`, never hoisted to a field, a module-level singleton, or anything shared between
calls — otherwise an "overwrite all" choice from one `update` command run could leak into a
later, unrelated run.

In the generic class, `BulkConflictState` is instantiated with `const bulkState = new
BulkConflictState();` as a local variable inside `execute()` (line 45 of
`update-tools-use-case.ts`), never as a class field and never at module scope. This is
identical to where it was constructed in both originals (line 38 of each old file). A grep
of the new file for `BulkConflictState` confirms the only two references are the import and
this one local instantiation inside `execute()`.

This was also verified empirically, not just by reading the code: the existing test
`"resolveConflictBulk called once for overwrite-all then not again for second tool"` in
`update-ai-tools-use-case.unit.test.ts` runs two tools (`claude`, `cursor`) through a single
`execute()` call with a mocked prompter, and asserts `resolveConflictBulkMock` is called
exactly once — proving the bulk decision persists *within* one invocation across the tools
it updates. This test passed unmodified against the generic implementation. Nothing in this
refactor introduces a second invocation observing state from a first, because the state
lives in a local variable that goes out of scope when `execute()` returns.

## Verification

1. `npx tsc --noEmit` — `TypeScript: No errors found`.
2. `pnpm test` from `cli/` — 197 test files, 2136 tests, all passing, 0 failures. Same count
   as the pre-refactor baseline. No test file was modified.
3. Biome, one file per invocation via `./node_modules/.bin/biome check --write <file>`:
   - `update-tools-use-case.ts` — "Checked 1 file in 29ms. No fixes applied."
   - `update-ai-tools-use-case.ts` — "Checked 1 file in 2ms. No fixes applied."
   - `update-ide-tools-use-case.ts` — "Checked 1 file in 2ms. No fixes applied."
4. Mutation test: changed `resolveTargetIds` in the generic class so that an explicit
   `toolArg` resolved to `[]` instead of `[toolArg]`. Ran
   `npx vitest run --project=unit tests/application/use-cases/global/update-ai-tools-use-case.unit.test.ts tests/application/use-cases/global/update-ide-tools-use-case.unit.test.ts`.
   Result: 2 failures out of 7 tests —
   `UpdateAiToolsUseCase > single toolArg > updates only the specified tool when toolArg is provided`
   in `update-ai-tools-use-case.unit.test.ts`, and
   `UpdateIdeToolsUseCase > single toolArg > updates only the specified tool when toolArg is provided`
   in `update-ide-tools-use-case.unit.test.ts`. Both the ai-side and the ide-side test file
   failed on the same single-line mutation, which is the expected signature of a genuinely
   shared implementation — a bug in the generic class cannot be contained to one category.
   Reverted the mutation; `pnpm test` re-run afterward: 197 files, 2136 tests, all passing
   again.
5. Coverage of the generic implementation, measured with
   `npx vitest run --project=unit --project=integration --coverage --coverage.include='src/application/use-cases/global/update-tools-use-case.ts' --coverage.reporter=json-summary --coverage.reportsDirectory=/tmp/cov-upd`:
   `update-tools-use-case.ts` — 100% statements (56/56), 100% branches (9/9), 100% functions
   (4/4), 100% lines (56/56). The two subclass wrapper files were also measured separately
   and are each 100% statements/branches/functions/lines.
