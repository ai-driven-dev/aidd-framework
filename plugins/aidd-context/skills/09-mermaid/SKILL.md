---
name: 09-mermaid
description: Generate a valid Mermaid diagram from a written source through a plan, generate, review loop. Use when the user wants to turn an architecture, lifecycle, or flow into a Mermaid diagram. Not for other diagram formats or image rendering.
argument-hint: architecture | lifecycle | flow
---

# Mermaid

Produces a valid, structured Mermaid diagram from a written source by planning it, confirming the plan, generating, and offering a review.

## Actions

| #   | Action    | Role                                                    | Input            |
| --- | --------- | ------------------------------------------------------ | ---------------- |
| 01  | `mermaid` | Plan, confirm, generate, and review one diagram         | a written source |

Run action `01` and run its `## Test` before trusting the result.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Plan before generating, and confirm the plan with the user. Block on the answer.
- Generate only what the confirmed plan holds. Never add a node or a relationship the user did not confirm.
- Follow the project's Mermaid conventions for every diagram.
- Output the diagram as a fenced block, never describe it in prose.

## References

- `references/mermaid-conventions.md`: the conventions and defaults every generated diagram follows.
