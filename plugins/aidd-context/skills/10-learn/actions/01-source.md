# 01 - Source

Identify and challenge the origin.

## Input

The user request and optional source hint: conversation, file, diff, or review.

## Output

One or more source descriptions that name where to look and how narrowly to read.

## Process

1. **Frame.** Apply [sources](../references/sources.md).
2. **Select.** Select the smallest readable source set that fits the current context.
3. **Ask.** Ask only when the source choice would change what gets learned.
4. **Stop.** Stop on a missing, empty, or ambiguous source.
5. **Emit.** Emit each source's kind, label, and scope.

## Test

| Case | Pass |
| --- | --- |
| A source is readable | one or more sources are emitted, each with kind, label, and scope |
| A source cannot be read | the run stops and names it |
