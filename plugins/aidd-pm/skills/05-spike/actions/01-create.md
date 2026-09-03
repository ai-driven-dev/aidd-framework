# 01 - Create

Qualify and persist an open spike without forcing investigation.

## Input

A question, related context, and any supplied route or authority.

## Output

A spike reference, or the reason no spike is needed. After a write, report the stable identity, changed fields as `before -> after`, affected relations, and the verification result. For a draft or no-write result, state that no persisted change occurred.

## Process

1. **Clarify.** When the question or decision is unclear, apply [capabilities](../references/capabilities.md).
2. **Qualify.** Apply [qualification](../references/qualification.md).
3. **Place.** Apply [persistence](../references/persistence.md) and follow its result.
4. **Route.** Resolve `save for later` or `investigate now`.
5. **Confirm.** Show the new Spike and any previous cancellation; without write authority, stop there.
6. **Write.** Fill the [spike template](../assets/spike-template.md) fields the evidence supports, and [relations](../references/relations.md). A keep-open Spike stops after `Bounds`; a replaced Spike records its cancellation and replacement under `Outcome` and `Follow-up`.
7. **Verify.** Read the affected graph back and report what changed.

## Test

| Case | Pass |
| --- | --- |
| Missing question, decision, or authority | Spike file count unchanged |
| Approved routed spike | one bounded Spike with `type: spike`, `status: open`, and owned relations only |
| Existing match | existing artifact reused; Spike file count unchanged |
| Changed question | previous Spike `cancelled` with outcome and follow-up; one new `open` Spike lists it under `supersedes` |
| Missing route | no Spike created; the choice is requested |
| Markdown | standard path used; no empty metadata or body-level status and relation fields |
