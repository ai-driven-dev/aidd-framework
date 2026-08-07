# 02 - Gather

Read the source and extract candidate lessons.

## Input

The selected source descriptions.

## Output

A list of candidate learnings grounded in evidence, or no candidates when nothing is worth persisting.

## Process

1. Apply [gather protocol](../references/gather-protocol.md) to the selected sources.
2. Extract durable signals with evidence.
3. Drop noise and already-useless items.
4. Emit the candidate list, or end with no candidates.

## Test

| Case | Pass |
| --- | --- |
| A candidate is emitted | it carries source, evidence, learning, and persistence reason |
| A source was not selected | no candidate comes from it |
