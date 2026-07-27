---
objective: "UpdateOneToolUseCase's catch is a stated, tested policy rather than an unexplained swallow."
status: implemented
---

# Plan: SPIKE-E6-05 + BUG-E6-06 — the catch in UpdateOneToolUseCase

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| **Source** | `epic-E6-error-handling-consistency.md` (BUG-E6-06) |

## Spike findings (SPIKE-E6-05) — bug largely infirmed

The ticket asked whether the `catch` that pushes to `errors` and returns `null` violates "use-cases throw, no try/catch" and "no silent errors". Traced it: **the behaviour is correct and deliberate, not a defect.**

- **It is required.** All three callers (`UpdateAllUseCase`, `UpdateAiToolsUseCase`, `UpdateIdeToolsUseCase`) run the same loop over installed tools. Throwing would abort the batch on the first bad tool, so tools after it would silently never be attempted — strictly worse.
- **It is not silent.** Every caller command (`update`, `ai`, `ide`) iterates `result.errors` and prints each one.
- **The exception is deliberate.** `InputRequiredError` is rethrown: it means a prompt is needed and the run cannot proceed unattended, so it must stop the batch. Already covered by a test.
- **This is an established codebase policy.** `MarketplaceCheckUseCase` and `MarketplaceRefreshUseCase` do the same thing and each carry an `@policy report-and-continue:` annotation.

So the DoD's first branch applies: keep report-and-continue, documented as an intentional exception. Migrating to throw-plus-caller-wrapper would move the identical try/catch into three places to satisfy a rule the policy already covers.

## Real gap found while verifying

The report-and-continue branch itself was **untested**. What existed:

- The integration test covered unmodified / force / keep / overwrite and the `InputRequiredError` rethrow — but no generic failure.
- The two caller tests named "captures failing tool in errors and succeeds for others" **mock `updateOneTool.execute`** and push to `errors` themselves, so they pin the caller's loop, not the catch.

Nothing failed if the catch were deleted. That is the branch the ticket is about.

## Decisions

| Decision | Why |
| -------- | --- |
| Annotate with `@policy report-and-continue`, matching the two existing sites | Makes the deliberate exception discoverable at the point of the code, so a future reader does not "fix" it into a throw. States the `InputRequiredError` carve-out too. |
| Add two tests for the catch: an `Error` rejection and a non-`Error` rejection | Pins both halves of `err instanceof Error ? err.message : String(err)`. Verified to fail when the catch is replaced with `throw err`. |
| Do not add coverage for `UpdateAllUseCase` | It has no test file, but its loop is identical to the two already covered, and the uncovered branch was the catch, now pinned. Noted as a separate observation, not silently folded in. |
