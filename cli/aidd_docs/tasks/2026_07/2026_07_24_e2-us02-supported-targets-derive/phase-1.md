---
status: done
---

# Instruction: Derive SUPPORTED_TARGETS from the build registry

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/
    │   ├── domain/models/framework-build.ts    ✏️ modify (add FRAMEWORK_BUILD_TARGET_MODES + SUPPORTED_BUILD_TARGETS)
    │   ├── infrastructure/deps.ts               ✏️ modify (drop the export added then reverted — see plan.md)
    │   └── application/commands/
    │       └── framework.ts                     ✏️ modify (import from domain, not infrastructure)
    └── tests/infrastructure/
        └── framework-build-registry.unit.test.ts  ✅ create (registry ↔ domain list drift guard)
```

> Revised after review feedback — see plan.md's Decisions for why the target list moved to `domain/` instead of staying in `deps.ts`.

## Tasks to do

### `1)` Add the canonical target/mode list to domain

1. In `domain/models/framework-build.ts`, add `FRAMEWORK_BUILD_TARGET_MODES` (the 9 known pairs, pure data) and `SUPPORTED_BUILD_TARGETS` (derived from it) — no imports beyond what the file already has.

### `2)` Use it in `framework.ts`, remove the `deps.ts` detour

1. Delete the hand-copied `const SUPPORTED_TARGETS: readonly string[] = [...]` (`framework.ts:11`).
2. Import `SUPPORTED_BUILD_TARGETS` from `../../domain/models/framework-build.js`.
3. Update the two usages (`framework.ts:39,41`) — behavior identical, sourced from domain.
4. Remove the (short-lived) `SUPPORTED_BUILD_TARGETS` export from `deps.ts` and its now-unused `FrameworkBuildTarget` import.

### `3)` Guard against the registry and the domain list silently diverging

1. Add `tests/infrastructure/framework-build-registry.unit.test.ts`: for the full cartesian product of targets × modes, assert `createFrameworkBuildUseCase(...)` is defined exactly for the pairs `FRAMEWORK_BUILD_TARGET_MODES` lists, and undefined for every other pair.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1, 2 | `aidd framework build --target <unknown>` still fails with the same clear error message as before. |
| 1, 2 | `aidd framework build --target <known> [--flat]` still works for all 9 existing target:mode combinations, identical output to before. |
| 3    | The new test fails if `deps.ts`'s `FRAMEWORK_BUILD_REGISTRY` ever adds or drops a key without updating `FRAMEWORK_BUILD_TARGET_MODES` to match, in either direction. |
| all  | `grep -rn "application/\|infrastructure/" src/domain/` finds nothing — domain still imports from neither. `tsc --noEmit` clean, full test suite passes. |
