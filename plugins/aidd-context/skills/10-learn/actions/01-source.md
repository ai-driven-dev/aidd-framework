# 01 - Source

Identify and challenge the origin.

## Input

The user request and optional source hint: conversation, file, diff, or review.

## Output

One or more source descriptions that name where to look and how narrowly to read.

## Process

1. Apply [sources](../references/sources.md).
2. Select the smallest readable source set that fits the current context.
3. Ask only when the source choice would change what gets learned.
4. Stop on missing, empty, or ambiguous sources.
5. Emit the selected source descriptions.

## Test

| Case | Pass |
| --- | --- |
| A source is readable | one or more source descriptions are emitted |
| A source cannot be read | the run stops and names it |
