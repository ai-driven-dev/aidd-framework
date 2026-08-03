# 01 - Scan

Read the project into a snapshot.

## Input

The project root.

## Output

The project snapshot, printed nowhere.

## Process

1. **Zones.** Evaluate the checks per [zones.md](../references/state/zones.md).
2. **Detect.** Resolve AI tools and wiring per [detection.md](../references/state/detection.md).
3. **Ledger.** Drop done steps per [done-rule.md](../references/state/done-rule.md).
4. **Hedge.** If a plan exists, pin the build-to-ship stage per [hedge.md](../references/state/hedge.md).
5. **List.** Gather installed AIDD plugins and skills via native discovery.
6. **Hold.** Keep the snapshot in context. Print nothing.

## Test

- Scan prints nothing.
- The snapshot carries a status per check.
- It carries the detected AI tools with wiring, and the installed skills.
- A ledgered step and a cross-branch PR never enter the snapshot's actionable set.
