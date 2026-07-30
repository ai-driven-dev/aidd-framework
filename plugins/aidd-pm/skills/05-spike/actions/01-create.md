# 01 - Create

Qualify and persist an open spike without forcing investigation.

## Input

A question, related context, and any supplied route or authority.

## Output

A spike reference, or the reason no spike is needed.

## Process

1. **Require.** If no unknown is present, ask for one and wait.
2. **Clarify.** Only if the question or decision is unclear, apply [capabilities](../references/capabilities.md).
3. **Qualify.** Apply [qualification](../references/qualification.md).
4. **Place.** Apply [persistence](../references/persistence.md) and follow its result.
5. **Route.** Resolve `save for later` or `investigate now`.
6. **Confirm.** Show the new Spike and any previous Spike cancellation.
7. **Write.** Fill earned fields of [spike template](../assets/spike-template.md). A keep-open Spike stops after `Bounds`; a replaced Spike records its cancellation and replacement under `Outcome` and `Follow-up`.

## Test

| Case | Observable |
| --- | --- |
| Missing question, decision, or authority | Spike file count is unchanged |
| Approved routed spike | One bounded Spike exists with `type: spike`, `status: open`, and owned relations only |
| Existing match | The existing artifact is reused and spike file count is unchanged |
| Changed question | Previous Spike is `cancelled` with outcome and follow-up; one new `open` Spike lists it under `supersedes` |
| Missing route | No spike is created and the choice is requested |
| Markdown | standard path used; no empty metadata or body-level status and relation fields |
