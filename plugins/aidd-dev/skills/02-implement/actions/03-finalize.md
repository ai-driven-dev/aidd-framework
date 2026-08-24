# 03 - Finalize

Run the validation and mark the plan implemented once every phase is done.

## Input

A plan whose phases are all `status: done`, from `02-execute`.

## Output

The feature validated green with the plan frontmatter `status: implemented`.

## Process

1. **Revalidate UI.** Apply the prepare UI graph gate once more, including no competing active contract for an establishment delta. Drift returns `replan needed` before final status mutation.
2. **Verify.** Run the plan's validation commands and tests. Never format code, never run dev mode.
3. **Mark.** Every phase done and validation green, set the plan `status: implemented` and commit it.

## Test

- The validation commands exit zero.
- The plan reads `status: implemented`, committed (`git status --short` shows it clean).
- An implemented establishment remains an approved delta until explicit system reconciliation verifies it.
