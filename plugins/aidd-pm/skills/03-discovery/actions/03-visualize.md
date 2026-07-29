# 03 - Visualize

Clarify a product relationship, journey, comparison, or screen structure when prose is weaker.

## Input

The current product understanding.

## Output

One optional table, Mermaid diagram, or low-fidelity wireframe.

## Process

1. **Create.** Apply [visuals](../references/visuals.md) to the current understanding.
2. **Show.** Present the visual and wait.
3. **Revise.** Fold user corrections into the visual.

## Test

| Case | Pass |
| --- | --- |
| No matching view | no `Product View` produced |
| Mermaid | syntax parses |
| Produced view | exactly one format; its format and `Any view` contracts pass |
