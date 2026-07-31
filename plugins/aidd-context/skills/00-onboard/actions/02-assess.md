# 02 - Assess

Turn the snapshot into one decision.

## Input

The project snapshot.

## Output

The decision, ready to render.

## Process

1. **Classify.** State class per [screen-map.md](../references/order/screen-map.md).
2. **Rank.** Top next action per [ranking.md](../references/order/ranking.md).
   - Idle: build the menu per [idle-menu.md](../references/order/idle-menu.md).
3. **Resolve.** Match each command to an installed skill.
   - Absent: name a gap by function, never invent a command.

## Test

- Assess renders nothing.
- Dev-flow, health, and idle stay back while a foundation is unmet.
- An idle decision offers the three umbrellas plus explore.
