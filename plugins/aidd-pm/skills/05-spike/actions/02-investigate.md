# 02 - Investigate

Collect only the evidence that can change the blocked decision.

## Input

A spike eligible for investigation, by id, URL, or path.

## Output

Evidence and an outcome status.

## Process

1. **Activate.** Resolve one spike and transition it to `in-progress` when allowed by [lifecycle](../references/lifecycle.md).
2. **Investigate.** Apply [investigation](../references/investigation.md) with matching [capabilities](../references/capabilities.md).

## Test

| Case | Pass |
| --- | --- |
| Terminal Spike | no attempt appended |
| Activation | frontmatter moves from `open` to `in-progress` |
| Attempts | each records method, evidence, and result; retries differ |
| Unapproved path | evidence kept; status unchanged; user asked |
| Output | evidence and a lifecycle status returned; history preserved; only the Spike changes |
