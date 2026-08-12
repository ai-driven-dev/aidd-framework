# Brainstorm: repair the gemini branch after its rebase

> Source: the branch `feat/511-gemini-flat-build-target`, rebased onto `main` on 2026-08-12. The work it carries is part 1 of `aidd_docs/tasks/2026_07/2026_07_27_gemini-cli-build-target/`, whose plan is already marked implemented.

## Refined idea

Bring the branch back to a working state after a rebase onto a `main` that had moved 76 commits ahead, by realigning how the `gemini` build target is declared onto the mechanism that replaced the old one during that interval, then obtain a binary verdict from the part-1 plan's own success condition (`cd cli && pnpm typecheck && pnpm lint && pnpm test`). The two auth-related failures already documented as environment-coupled in the part-1 amendments count as known noise, not as regressions.

## What the rebase actually did

The rebase itself completed and left a linear history: seven commits replayed, nothing behind `main`. One commit, `feat(cli): declare gemini's flat build contract`, was stopped and continued, so its conflict was resolved by hand.

The breakage is semantic, not textual. Between the branch point and `main`, the pull request that derives framework build's supported targets from the build registry replaced the hardcoded target list with a table of target/mode pairs, `FRAMEWORK_BUILD_TARGET_MODES`, from which `SUPPORTED_BUILD_TARGETS` is now derived. The branch registers `gemini` through the old surface. The conflict resolution already migrated the command surface: `cli/src/application/commands/framework.ts` imports the derived constant and its `--target` help text lists `gemini`. What it did not do is add `gemini` to the table itself.

Three consequences follow by construction, none of them observed by running anything:

- `cli/tests/domain/tools/registry-conformance.unit.test.ts` asserts every registered AI tool has an entry in the table. `gemini` has been registered since the tool-id commit, so this guard fails.
- `cli/tests/infrastructure/framework-build-registry.unit.test.ts` asserts the `deps.ts` build registry matches the table exactly. The contract commit adds a `gemini:flat` row to `deps.ts`, so the two diverge.
- `framework.ts` rejects any target absent from the derived list, so `aidd framework build --target gemini --flat` would exit with `Unsupported target 'gemini'`, making the branch's whole feature unreachable in the real CLI.

There is no choice to make between the old and new declaration mechanism: the old one no longer exists. The single uncommitted line adding `{ target: "gemini", mode: "flat" }` to the table is the migration, and as far as static reading goes, all of it.

## Open assumptions and risks

- That the one line is sufficient is unverified. Only the three guards above were traced; nothing else was searched for. Running the success condition is what settles it.
- The golden snapshot was rebaselined before the rebase, against `tests/fixtures/framework-real`. `main` has since changed framework content (the skill-contract rehoming, the QA and communication evaluations, the citation refactors). If that fixture tracks the real repository content, the nine pre-existing golden cells may have drifted legitimately rather than through this branch. The chosen verdict is binary, so this is only worth separating if the golden suite actually goes red.
- Where the fix lands in history is undecided: a new commit at the tip is simpler, folding it into the tool-id registration commit is what keeps the branch bisectable. To settle before committing.
- Parts 2 through 4 of the parent task stay pending or blocked and are out of scope here.
