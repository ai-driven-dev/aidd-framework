---
objective: "Turn the implicit build-cache force:true assumption in EnsureBuiltMarketplaceUseCase into an explicit, tested outDir invariant, after confirming the reported data-loss risk does not exist."
status: implemented
---

# Plan: build-cache force invariant

## What was verified before writing anything

`EnsureBuiltMarketplaceUseCase.runBuild` (`src/application/use-cases/shared/ensure-built-marketplace-use-case.ts`) has exactly two callers, both private methods of the same class:

- `build()` (line 112) passes `builtDir`, computed as `builtMarketplaceDir(projectRoot, marketplaceName, target)`, which resolves to `<projectRoot>/.aidd/cache/built/<marketplace>/<target>` (`domain/models/paths.ts`). Used when the resolved source directory does not nest with the cache.
- `buildViaTemp()` (line 131) passes `temp = join(tmpdir(), 'aidd-built-<target>-<mode>')`, which is `deleteDirectory`'d immediately before the build (line 130), so it is always empty at build time. Used when the source nests with the cache (the "dogfood" case: building the framework's own repo).

Neither directory is user-authored content. `builtDir` is an aidd-owned, regenerable cache; `temp` is a scratch directory this class owns and clears itself. Forcing collision-overwrite at either path is cache invalidation, not destruction of user work. The direct `aidd framework build --flat --force` CLI path (`commands/framework.ts`) threads the user's real `--force` flag independently and is unaffected by anything in this file.

No third caller of `runBuild` exists, and no `outDir` reaching it can point outside `.aidd/cache/built/` or the OS temp dir under the current code. The reported data-loss risk is infirmed.

## A correction to the ticket's premise

The ticket described the mechanism as: `runBuild` passes `force: true` to `build.execute(...)`, and that value "reaches `FlatBuildStrategy`" where `checkCollision` decides whether to throw. This is not how the code works, and it matters for where the comment and test belong.

`FrameworkBuildUseCase.execute(options)` (`src/application/use-cases/framework/framework-build-use-case.ts`) never reads `options.force`. The `force` that `FlatBuildStrategy.checkCollision` actually consults (`this.force`, `flat-build-strategy.ts:32`) is a constructor parameter, fixed when the strategy is built. For the `EnsureBuiltMarketplaceUseCase` path, that happens in the `frameworkBuildFor` closure in `src/infrastructure/deps.ts` (`ctx.force`, hardcoded `true` there), not inside `runBuild`.

So `force: true` at `ensure-built-marketplace-use-case.ts:151` (`build.execute({ ..., force: true })`) is a value the domain type `FrameworkBuildOptions.force` accepts but the use-case never consults; it has no effect on collision behavior. This was confirmed empirically (see Verification, mutation a). `FrameworkBuildOptions.force` therefore appears vestigial as a field on `execute()`'s options. This task leaves the type alone, since removing it is a type-level change out of scope for a comment-plus-test change.

The comment and reasoning documented in `deps.ts:450-454` (added by commit `69b0537c`, "fix(cli): document intentional force on internal build-cache rebuild (#505)", 5 days before this task) already covers the one site where `force` is load-bearing. That work was not redone here.

## What was already done, and the gap that remained

Commit `69b0537c` (PR #505) added a comment at the live `force` site (`deps.ts`) and a test, "force behavior at the cache-rebuild path" (`tests/.../ensure-built-marketplace-use-case.integration.test.ts`), asserting that a real `FlatBuildStrategy` with `force: true` overwrites a colliding cache file instead of throwing `FlatTargetExistsError`. That test is a behavioural pin: it proves the collision-bypass mechanism itself works when `force` is `true`.

It does not pin production wiring, and it does not pin the outDir invariant this task was asked for:

- Its `realBuildFor` constructs `FlatBuildStrategy` with a literal `true` written directly in the test, independent of `deps.ts`. Flipping `deps.ts`'s real `force: true` to `false` does not fail this test (confirmed empirically, see Verification). The test exercises `FlatBuildStrategy`'s own logic, not the actual dependency wiring.
- Nothing anywhere asserted that `outDir` stays under the build cache or temp dir. A change that pointed either call site in `runBuild` at a live user directory would not have been caught by any existing test, confirmed by pointing `build()`'s outDir at a directory outside the cache: the pre-existing behavioural test failed, but only incidentally, via `OutDirNotDirectoryError` from an unrelated preflight check in `FlatBuildStrategy.preBuild`, not from any assertion about the path itself.

This is exactly the "naive test is nearly worthless" risk described in the task: a test that only asserts "collision doesn't throw" pins that `force` works, but says nothing about where it is allowed to apply.

## What this task adds

1. A comment on `runBuild` itself (`ensure-built-marketplace-use-case.ts`, above the method, not on the `force: true` literal), stating the outDir invariant: every `outDir` reaching this method is either `builtMarketplaceDir()` or a temp dir this class just cleared, never a user directory. Placed on the method rather than the (inert) `force: true` literal, since that literal has no causal role in the invariant.
2. A new test, "outDir invariant for the cache-rebuild build path", in the same test file. It spies on the injected `buildFor` factory to capture every `outDir` passed to it across both call paths: the direct path (`build()`, non-nested source) and the temp-routed path (`buildViaTemp()`, nested/dogfood source). It asserts each captured value is either under `<projectRoot>/.aidd/cache/built` or under the OS temp dir, plus explicitly checks the dogfood call went through the temp dir. This is independent of the pre-existing behavioural test, which it references but does not duplicate.

`tests/helpers/ports/build-unit-deps.ts` and `tests/helpers/ports/fake-ensure-built-marketplace.ts` were read before writing the test. Neither fits: `build-unit-deps.ts` wires a full unit-test dependency graph around `fakeEnsureBuiltMarketplace()`, a stand-in for the whole use-case under test here, not for the `FrameworkBuildUseCase`/`FrameworkBuildFor` this test needs to spy on. `fake-ensure-built-marketplace.ts` itself uses `as unknown as EnsureBuiltMarketplaceUseCase` for the same reason the new test casts its spy to `FrameworkBuildUseCase`: the class has `private readonly` constructor fields, so no structurally-typed object literal is assignable to it without a cast. The new test's cast follows the file's own pre-existing pattern (lines 74 and 102 of the same file, predating this change).

No production behavior changed. The diff to `src/` is comment-only.

## Verification (real numbers)

1. `npx tsc --noEmit`: clean, no errors.
2. `pnpm test` from `cli/`: 200 test files, 2153 tests passing, 0 failures (baseline was 2152; +1 for the new test). Confirmed the `src/` diff is comment-only via `git diff --stat -- src/` (3 insertions, 0 deletions, one file).
3. Biome, one file at a time via the binary directly:
   - `ensure-built-marketplace-use-case.ts`: "Checked 1 file in 36ms. No fixes applied."
   - `ensure-built-marketplace-use-case.integration.test.ts`: "Checked 1 file in 9ms. No fixes applied."
4. Mutation testing, all reverted after observation, suite re-confirmed green (2153/2153) afterward:
   - (a), as specified by the ticket: flipped `force: true` to `force: false` at `ensure-built-marketplace-use-case.ts:151` (the site the ticket named). Result: no test failed, full suite (200 files / 2153 tests) still green. This is the empirical proof that this literal is inert; it does not reach `FlatBuildStrategy`.
   - (a), at the actually load-bearing site: flipped `force: true` to `false` in the `frameworkBuildFor` closure in `deps.ts:458`. Result: no test failed either. The pre-existing "force behavior" test does not exercise this closure; it builds its own `FlatBuildStrategy` with a hardcoded `true`. Out of scope to fix here, noted as a gap rather than remediated, since the task scope is the outDir invariant in `ensure-built-marketplace-use-case.ts`.
   - (b), direct path: changed `build()` (line 112) to pass `join(sourceDir, "..", ".claude")` instead of `builtDir`. Result: the new invariant test failed immediately with a clear `AssertionError` on the outDir check. The pre-existing behavioural test also failed, but only incidentally (`OutDirNotDirectoryError` from `FlatBuildStrategy.preBuild`'s directory-existence guard), not because it checks the path itself. Reverted; suite re-confirmed green.
   - (b), temp path: changed `buildViaTemp()` (line 129) to compute `temp` as a path escaping the project tree instead of `join(tmpdir(), ...)`. Result: the new invariant test failed with the same `AssertionError`, this time on the dogfood/temp capture, while the pre-existing "force behavior" test (unrelated target/mode) stayed green, proving the new test is the only one covering this call site. Reverted; suite re-confirmed green.

Mutation (b) is the one required by the task's definition of done ("fails if this stops being true"), and it holds for both call sites the invariant covers. Mutation (a) as literally specified does not break anything, because the named site is dead code. This is reported rather than silently "fixed" by moving the assertion to a site the ticket did not ask about, per the task's instruction to stop and report when a premise is wrong.
