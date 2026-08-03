# 05 - Prioritize

Rank the backlog by value against effort, breaking ties with impact.

## Input

The estimated stories from `04-estimate-impact`.

## Output

The stories as a single ordered list, each with a priority rank, ordered by the method in [rating.md](../references/rating.md).

## Process

1. **Score.** For each story, weigh delivered value against its story points.
2. **Order.** Sort by descending value-to-effort, then break ties with the lower impact first, per [rating.md](../references/rating.md).
3. **Override.** Pull a story earlier only when a later story depends on it. State that reason on the affected story.
4. **Rank.** Write the priority rank into each story's estimation block.

## Test

- The output is a strictly ordered list with a unique rank per story.
- The ranking key is stated, and any dependency-driven override names its reason.
