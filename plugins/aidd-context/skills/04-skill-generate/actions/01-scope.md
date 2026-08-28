# 01 - Scope

Frame the skill before any file is touched.

## Input

A free-form request to create a skill.

## Output

The confirmed frame, written nowhere, per [scope-frame.md](../references/scope-frame.md).

## Process

1. **Detect.** Detect the installed tools per [tool-detect.md](../references/tool-detect.md).
2. **Fill.** For each field in [scope-frame.md](../references/scope-frame.md), propose a value or ask one question.
3. **Check.** Check the name per [naming.md](../references/naming.md) and surface any overlap.
4. **Confirm.** Hand the confirmed frame to plan.

## Test

| Case | Pass |
| --- | --- |
| The action runs to completion | `git status --porcelain` reads the same after as before |
| A name overlaps an installed skill | the overlap is surfaced before the frame is handed on |
| No name overlaps | the run states that it found none |
| A frame field needs the user | one question is asked, and only that one |
| The frame is handed to plan | its target was confirmed by the user first |
