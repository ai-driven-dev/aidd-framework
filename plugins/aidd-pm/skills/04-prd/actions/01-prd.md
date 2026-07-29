# 01 - PRD

Turn product evidence into approved requirements.

## Input

A request, a Product Brief, or user stories.

## Output

An approved PRD at the resolved path.

## Process

1. **Resolve.** A Product Brief targets its sibling `prd.md`. Other input keeps `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature-name>-prd.md`.
2. **Read.** When the source is a Product Brief, apply [Product Brief input](../references/product-brief-input.md). Otherwise extract the problem, outcomes, audience, scope, and constraints from the request and stories.
3. **Draft.** Fill [PRD template](../assets/prd-template.md), omitting no required section.
4. **Confirm.** Show the full draft and wait. Fold corrections and show it again.
5. **Write.** Save the approved content at the resolved path.

## Test

- Without approval, no PRD changes.
- A Product Brief is consumed directly without asking the user to reformat it.
- A superseded Product Brief resolves to its current replacement.
- The approved PRD exists at the resolved path.
- It contains the eight headings: Overview, Problem Statement, Goals, Non-Goals, User Stories, Acceptance Criteria, Dependencies, Open Questions.
- It has no solution detail: no tech-stack, data-model, or architecture section, no `## Implementation` heading, and no source code.
