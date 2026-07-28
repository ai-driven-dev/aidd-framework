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

| Case | Observable |
| --- | --- |
| Terminal spike | No attempt is appended |
| Attempts | Each records method, evidence, and result; retries differ |
| Unapproved path | Evidence is kept; status is unchanged; user is asked |
| Output | Evidence and a lifecycle status return; history remains; only the spike changes |
