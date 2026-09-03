---
status: done
---

# Instruction: Inject PostInstallPipelineUseCase and GitignoreUseCase

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/
    │   ├── application/use-cases/
    │   │   ├── shared/post-install-pipeline-use-case.ts   ✏️ modify (inject Gitignore, drop dead fs)
    │   │   ├── install/install-ide-config-use-case.ts      ✏️ modify (inject pipeline)
    │   │   ├── install/install-ide-tool-use-case.ts        ✏️ modify (inject pipeline)
    │   │   ├── install/install-runtime-config-use-case.ts  ✏️ modify (inject pipeline)
    │   │   └── clean-use-case.ts                            ✏️ modify (inject gitignore)
    │   └── infrastructure/deps.ts                           ✏️ modify (build both, wire 4 consumers)
    └── tests/helpers/ports/build-unit-deps.ts               ✏️ modify (mirror the new signatures)
```

## Tasks to do

### `1)` `PostInstallPipelineUseCase` takes `GitignoreUseCase`

1. Constructor becomes `(manifestRepo: ManifestRepository, gitignoreUseCase: GitignoreUseCase)` — `fs` removed (its only use was the `new` being deleted; verified by count).
2. `execute()` calls `this.gitignoreUseCase.execute(...)` instead of `new GitignoreUseCase(this.fs).execute(...)`.
3. Drop the now-unused `FileReader`/`FileWriter` type imports if nothing else in the file needs them.

### `2)` The 3 install use-cases take the pipeline

1. Add `private readonly postInstallPipelineUseCase: PostInstallPipelineUseCase` to each constructor (append — keeps existing positional args stable for any caller not updated in the same pass).
2. Replace each `await new PostInstallPipelineUseCase(this.fs, this.manifestRepo).execute({...})` with `await this.postInstallPipelineUseCase.execute({...})`.
3. Keep `fs`/`manifestRepo` — both still used elsewhere in all three.

### `3)` `clean-use-case` takes `GitignoreUseCase`

> `init-use-case` was dropped from scope mid-implementation — see plan.md Decisions (InitUseCase is itself outside the dependency graph; injecting there would add ad-hoc `new`s, not remove them).

1. Insert `private readonly gitignoreUseCase: GitignoreUseCase` before the optional `prompter?` param.
2. `clean-use-case.ts:55` → `this.gitignoreUseCase.remove(...)`.
3. Keep `fs` (13 remaining uses).

### `4)` Wire in `deps.ts`

1. Build `gitignoreUseCase` first, then `postInstallPipelineUseCase(manifestRepo, gitignoreUseCase)`, both **before** the 5 consumers they feed.
2. Pass them into `installIdeConfigUseCase`, `installIdeToolUseCase`, `installRuntimeConfigUseCase`, `cleanUseCase`.
3. Expose neither on the `Deps` interface unless a command needs it directly — internal wiring only, keeps the public surface unchanged.

### `5)` Mirror the signatures in the test helper

1. `tests/helpers/ports/build-unit-deps.ts` constructs `installRuntimeConfigUseCase` and `installIdeConfigUseCase` directly — update those call sites to build and pass the two new collaborators.
2. Grep for any other test constructing the 5 consumers directly and update the same way.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1-5  | `aidd install`, `aidd update`, `aidd clean`, `aidd setup` behave identically — `.gitignore` still gains `.aidd/cache/` on install/init, and `aidd clean` still removes it. Verified by the existing suite passing with zero assertion changes. |
| 1-4  | `grep -rn "new PostInstallPipelineUseCase\|new GitignoreUseCase" src/` returns only the two construction sites in `deps.ts`, plus the one documented exception in `init-use-case.ts`. |
| 1    | `PostInstallPipelineUseCase` no longer accepts `fs`; `tsc` proves no caller still passes it. |
| all  | `tsc --noEmit` clean, full suite green. |
