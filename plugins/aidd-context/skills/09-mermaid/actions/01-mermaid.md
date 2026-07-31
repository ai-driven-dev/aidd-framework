# 01 - Mermaid

Produce a valid, high-quality Mermaid diagram from a written source through a plan, confirm, generate, review loop.

## Input

The written source to diagram: a paragraph, a list, or a section describing an architecture, a lifecycle, or a flow. Ask for it when it is not provided.

## Output

A Mermaid diagram in a fenced block, plus an optional review note. On the first message, list the steps below as short bullets so the user knows what is coming.

## Process

1. **Get the source.** Ask for the document to diagram when it is not already provided.
2. **Plan.** Analyze the source and write a plan that names: the components and their logical groups, the parent and child elements, the directions and the hierarchy, the relationships (connections, dependencies), and the labels or notes each element needs.
3. **Confirm.** Ask the user to confirm the plan. Block on the answer.
4. **Generate.** Produce a valid Mermaid diagram from the confirmed plan, following the conventions and defaults in [mermaid-conventions.md](../references/mermaid-conventions.md).
5. **Offer a review.** Ask whether the user wants a review, and wait.
6. **Review on confirm.** Check the syntax, look for an empty or misplaced node, and suggest improvements.

## Test

- The diagram is in a fenced Mermaid block, parses without error, follows the conventions reference, and holds no node or relationship absent from the confirmed plan.
