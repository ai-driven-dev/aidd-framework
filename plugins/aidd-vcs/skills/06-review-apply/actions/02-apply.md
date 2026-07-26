# 02 - Apply

Turn each collected comment into one scoped code fix.

## Input

The list of comments from `collect`.

## Output

The modified files, one intentional change per comment.

## Process

1. **Read.** For each comment, read the targeted file at the noted line plus enough context to see the whole mechanism — the function, the config, or a neighboring file the comment implies (e.g. `next.config.ts` for a `basePath`), not only the annotated line.
2. **Judge.** Evaluate any fix the comment suggests instead of copying it verbatim — the repo's context may call for a different solution.
3. **Trace flags.** When the comment or code touches an env var, flag, or conditional config, check explicitly what happens on the other branch of that condition, even if it is not active today.
4. **Fix.** Apply one fix per comment, scoped to the point raised — no reformatting or refactor beyond it. If a comment flags scope creep, shrink the diff to the real intent rather than layering another change on top.
5. **Check scope.** After each fix, diff against the base (`git diff {base}...HEAD -- {file}` and the working tree) and confirm only intentional changes remain.

## Test

- Each fixed file's diff against the base contains only the change its comment asked for.
- A comment whose suggested fix was rejected has a recorded reason before the run moves on.