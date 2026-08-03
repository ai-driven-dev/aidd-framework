# 01 - Shape

Frame one coherent product outcome as an Epic.

## Input

A request, Product Brief, PRD, existing Epic, or current context.

## Output

One Epic draft.

## Process

1. **Resolve.** Inspect the supplied source, relevant project artifacts, and matching backlog items. Ask for the need only when none can be resolved.
2. **Qualify.** Apply [qualification](../references/qualification.md). On mismatch, apply [handoffs](../references/handoffs.md).
3. **Gap.** Find the highest-consequence unknown that can change the goal alignment, outcome, boundaries, success evidence, or dependencies. Do not fill it by inference.
4. **Question.** Ask one focused open question, fold its answer, and repeat while a blocking gap remains. Offer options only when the user needs anchors, with no unsupported default.
5. **Shape.** Fill [Epic template](../assets/epic-template.md) from confirmed evidence and explicit accepted assumptions.
6. **Feedback.** Show the complete draft and fold corrections before review.

## Test

| Case | Pass |
| --- | --- |
| No source | no draft; one open question for the outcome |
| Different work type | no Epic draft; the offered capability returned |
| Draft | `type: epic`, `status: proposed`, required sections, no placeholder, and sourced claims |
| Product Brief source | goal relation proposed once; duplicate source relation absent |
| Proposed | unsupported required content is not inferred; one question for the highest gap |
