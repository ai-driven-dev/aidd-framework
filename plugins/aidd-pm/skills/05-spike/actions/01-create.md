# 01 - Create

Qualify and persist an open spike without forcing investigation.

## Input

A question and any related need, backlog item, initiative, or decision.

## Output

A spike reference, or the reason no spike is needed.

## Process

1. **Require.** If no unknown is present, ask for one and wait.
2. **Clarify.** Only if the question or decision is unclear, apply [capabilities](../references/capabilities.md).
3. **Qualify.** Apply [qualification](../references/qualification.md).
4. **Place.** Apply [persistence](../references/persistence.md) and follow its result.
5. **Route.** Resolve `save for later` or `investigate now`.
6. **Confirm.** For a new spike, show the question, parents, decision, bounds, and route.
7. **Write.** For a new spike, fill only earned fields and sections of [spike template](../assets/spike-template.md). A keep-open spike stops after `Bounds`.

## Test

| Case | Observable |
| --- | --- |
| Missing question, decision, or approval | Spike file count is unchanged |
| Approved routed spike | One linked, bounded `open` file exists without unearned content |
| Existing match | The existing artifact is reused and spike file count is unchanged |
| Missing route | No spike is created and the choice is requested |
