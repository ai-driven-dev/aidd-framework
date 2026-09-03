---
objective: "PostInstallPipelineUseCase and GitignoreUseCase are built once in deps.ts and injected, so a test can substitute them at the command level like every other shared use-case."
status: implemented
---

# Plan: US-E6-07 — inject PostInstallPipelineUseCase / GitignoreUseCase

## Overview

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **Goal**   | Replace 6 ad-hoc `new` sites with constructor injection, so both use-cases join the dependency graph instead of escaping it. |
| **Source** | `epic-E6-naming-di-hygiene.md` (US-E6-07, cartography item B11) |

## Phases

| #   | Phase                          | File                          |
| --- | -------------------------------- | ------------------------------ |
| 1   | Inject both shared use-cases     | [`phase-1.md`](./phase-1.md) |

## Findings (verified against current code, not trusted from the ticket)

**6 ad-hoc instantiation sites, exactly as B11 claimed:**

`new PostInstallPipelineUseCase(this.fs, this.manifestRepo)` — 3 sites:
- `install/install-ide-config-use-case.ts:59`
- `install/install-ide-tool-use-case.ts:99`
- `install/install-runtime-config-use-case.ts:69`

`new GitignoreUseCase(this.fs)` — 3 sites:
- `clean-use-case.ts:55` (calls `.remove()`)
- `init-use-case.ts:73` (calls `.execute()`)
- `shared/post-install-pipeline-use-case.ts:23` (calls `.execute()`)

**Both are stateless** — `GitignoreUseCase` holds only `private readonly fs`; `PostInstallPipelineUseCase` holds only `fs` + `manifestRepo`. No memoization, no accumulators. Safe to share as singletons (same check applied in E1/#508).

**One nesting**: `PostInstallPipelineUseCase` itself instantiates `GitignoreUseCase`, so the graph is `GitignoreUseCase → PostInstallPipelineUseCase → 3 install use-cases`.

## Decisions

| Decision | Why |
| -------- | --- |
| Drop `fs` from `PostInstallPipelineUseCase`'s constructor after injecting `GitignoreUseCase` | Verified by count: `this.fs` appears exactly **once** in that file — the `new GitignoreUseCase(this.fs)` being removed. Leaving it would be an unused constructor param, against the project's dead-code rule. Same subtractive follow-through as #508. |
| Keep `fs` on all other consumers | Verified by count: `clean-use-case` uses `this.fs` 13×, and the 3 install use-cases are file-heavy. |
| **Correction found during implementation**: `manifestRepo` also goes dead in `install-ide-config` and `install-runtime-config` | The plan originally asserted `fs`/`manifestRepo` both stay used in all three install use-cases. That was wrong — I counted `this.fs` but not `this.manifestRepo`. Biome's `noUnusedPrivateClassMembers` caught it at commit time: those two classes used `manifestRepo` *only* to build the pipeline being injected, so it drops to 0 uses. Removed from both (and from all 8 call sites; `tsc` enumerated them). `install-ide-tool` still uses it once, so it keeps the param — checked per file, not assumed. |
| **`init-use-case.ts` left as-is — 5 of the 6 sites converted, not 6** | Discovered mid-implementation: `InitUseCase` is not in the dependency graph at all. It has no `deps.ts` entry; it is itself ad-hoc constructed by `setup-use-case.ts:85` plus **13 test call sites**. Injecting `GitignoreUseCase` into it would force every one of those callers to write `new GitignoreUseCase(deps.fs)` themselves — *more* ad-hoc instantiation than before, and it would not achieve the ticket's stated goal (substituting a mock at the command level), since `InitUseCase` still escapes the graph one level up. The real fix is "wire `InitUseCase` into `deps.ts`", a distinct concern outside B11's scope. Recorded rather than silently half-done. |
