# 01 - Frame

Resolve the source and bound one set of User Stories.

## Input

An Epic, Product Brief, PRD, bounded request, existing Stories, or current context.

## Output

One confirmed Story scope with its source and optional parent.

## Process

1. **Resolve.** Inspect the supplied source, relevant project artifacts, and matching backlog items. Ask for the need only when none can be resolved.
2. **Qualify.** Apply [qualification](../references/qualification.md). On mismatch, apply [handoffs](../references/handoffs.md).
3. **Bound.** Keep only sourced actor, need, outcome, boundaries, source, and parent.
4. **Confirm.** Ask one question and wait when any missing value can change the Story.

## Test

| Case | Pass |
| --- | --- |
| No source | no candidate; one open question for the need |
| Missing outcome | no candidate; one open question for the user or stakeholder value |
| Different work type | no Story candidate; the offered capability returned |
| Valid scope | one outcome, explicit boundaries, identified source, and confirmed parent when present |
