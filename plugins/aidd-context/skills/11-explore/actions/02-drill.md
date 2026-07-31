# 02 - Drill

Descend one axis the user picked, or all of them, level by level. List each level in full, recommend a best match when the user has a goal, and go one level deeper on request until a leaf or a stop.

## Input

A scope: one axis (a Tooling surface, Context, or Codebase) or all three. Plus an optional goal. The current level when re-entered deeper.

## Output

A full listing of the current level, and, when the user gave a goal, a single best-match recommendation with its invocation path. Then a proposal to descend, back up, switch axis, or stop.

## Process

1. **Detect the tools if entered cold.** When the survey did not run first, detect the project's AI tools from the signals in [ai-mapping.md](../references/ai-mapping.md) before listing anything. Propose the set when it is ambiguous.
2. **Set the scope.** One axis, or all three. For all, take each axis in turn at one level only, never auto-descend every leaf at once.
3. **List the level.** Enumerate the current level in full from the same sources as the survey ([ai-mapping.md](../references/ai-mapping.md) for the Tooling and Context surfaces). The top level of an axis is its surfaces or items, a deeper level is one item's internals, a skill's actions, a memory file's sections, a module's files. For a Tooling surface, render a table: the item, where it lives, and its one-line purpose. For a rule scan, the `scripts/list-rules.mjs` helper inventories rules across every tool surface.
4. **Match the goal.** When the user named a goal, score this level's items and pick the single best match. Mention a close second only when it is genuinely tied.
5. **Point.** Give a chosen item's exact invocation path. Never run it.
6. **Descend, loop, or stop.** Offer to expand one item one level deeper, back up, switch axis, or stop. On expand, repeat from step 3 against that item. Stop at a leaf or when the user is done. Wait for the answer.

## Test

- Accepts a direct axis or all without a prior survey, detecting the tools when entered cold.
- Each level lists only present items, descends only one level per user confirmation, and stops at a leaf or on request.
- A named goal yields exactly one best match with its invocation path, nothing is invoked, and no level prescribes a next step.
