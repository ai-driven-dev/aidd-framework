# 02 - Plan

Break the skill into atomic, testable actions: one action, one job.

## Input

- From scope, the create frame.
- For a modify, the existing skill, read in place.

## Output

A plan table, one row per action: slug, input to output, test, and any dependency.

## Process

1. **List.** List every distinct job the output needs. Modify: start from the existing actions, touch only the jobs the user named.
2. **Atomize.** Prefer few actions, a job each, not a step. Merge two that share most logic.
3. **Number.** Name, number, and give each an observable test, per [skill-authoring.md](../references/skill-authoring.md).
4. **Confirm.** Present the table, validate each test with the user.

## Test

| Case | Pass |
| --- | --- |
| The table is presented | every row is one job carrying a checkable test |
| A row consumes an output | that output comes from an earlier row, never a later one |
| The run is a modify | only the jobs the user named have a row |
