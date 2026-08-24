# 02 - Map

Return the current shared UI system without changing it.

## Input

The evidence map from [01-inspect.md](01-inspect.md) in discover mode.

## Output

A compact system map naming the active contract when present, its revision and scope, canonical implementation sources, confirmed conventions, conflicts, drift, and evidence gaps.

## Process

1. **Select.** Keep shared tokens, layouts, components, states, adaptation rules, accessibility rules, and assets that have direct evidence.
2. **Reference.** Name canonical source paths instead of copying implementation catalogs or every value.
3. **Separate.** Keep planned change, drift, stale memory, and unconfirmed evidence outside the map.
4. **Return.** Return only evidenced categories without writing an artifact.

## Test

| Case | Pass |
| --- | --- |
| Active contract | id, revision, scope, and implementation sources are named |
| Lightweight project | every reported convention cites a source and categories without evidence are absent |
| External `DESIGN.md` | it is evidence, never adopted automatically |
| Conflicting systems | ambiguity remains explicit when dominance is unsupported |
