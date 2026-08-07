# 02 - Gather

Read the source and extract candidate lessons.

## Input

The selected source descriptions.

## Output

A list of candidate learnings grounded in evidence, or no candidates when nothing is worth persisting.

## Process

1. **Read.** Apply [gather protocol](../references/gather-protocol.md) to the selected sources.
2. **Extract.** Extract durable signals with their evidence.
3. **Drop.** Drop noise and already-useless items.
4. **Emit.** Emit the candidate list, or end stating there is none.

## Test

| Case | Pass |
| --- | --- |
| A candidate is emitted | it carries source, evidence, learning, and persistence reason |
| A source was not selected | no candidate comes from it |
