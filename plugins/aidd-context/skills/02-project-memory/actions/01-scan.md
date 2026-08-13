# 01 - Scan

Read the project.

## Input

The project root.

## Output

The confirmed capabilities and external tools, printed nowhere.

## Process

1. **Ground.** Look for something to remember: source code, or anything written about what the project is.
   - Nothing there: stop, say so, send the user to create something first.
2. **Find.** Detect the capabilities per [capability-signals.md](../references/capability-signals.md), each with its evidence.
3. **Map.** Detect the external tools per [ecosystem-signals.md](../references/ecosystem-signals.md), each with its evidence.
   - They fill the `ecosystem` capability, which holds on every project, whatever the bank already has.
4. **Ask.** Show what the scan found, ask for what the repo cannot prove, and wait.
   - No bank yet: show every capability and tool, and let the user add or drop one.
   - A bank exists: read [memory-destinations.md](../references/memory-destinations.md) backwards for the capabilities it holds, and show only the delta.
5. **Confirm.** Keep what the scan found, plus the user's additions, minus their drops. A bank missing one still gets it written.

## Test

| Case | Pass |
| --- | --- |
| The action completes | no file under the project changed |
| A capability is reported | the path or dependency named as its evidence exists |
| A tool is reported | it carries one access mode per actor that reaches it |
| The bank already holds every capability found | the delta is empty and the action asks nothing |
| The repo holds no code and nothing describing it | the run stops at Ground and hands nothing on |
