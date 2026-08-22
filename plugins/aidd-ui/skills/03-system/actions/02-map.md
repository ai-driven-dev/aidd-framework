# 02 - Map

Summarize the stable conventions of the discovered interface system.

## Input

The evidence map from `01-inspect` in discover mode.

## Output

A compact system map naming the approach and source locations for tokens, layout, shared components and states, forms, navigation, responsiveness, motion, and accessibility when present.

## Process

1. **Select.** Keep stable conventions and source locations, not a catalog of component internals or copied values.
2. **Separate.** Mark conflicts, gaps, and memory drift outside the confirmed system map.
3. **Return.** Omit categories with no evidence rather than filling them with generic guidance.

## Test

| Case | Pass |
| --- | --- |
| Mature system | stable surfaces and their source locations are named |
| Lightweight project | the map preserves its actual maturity and invents no formal taxonomy |
| Matching memory | memory facts are confirmed by repository paths |
| Conflicting systems | ambiguity remains explicit when dominance cannot be established |
