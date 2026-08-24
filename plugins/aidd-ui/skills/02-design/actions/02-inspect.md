# 02 - Inspect

Resolve the UI authority and implementation evidence for the feature target.

## Input

The frame from [01-frame.md](01-frame.md) and the project root.

## Output

An evidence map naming zero or one active UI system contract, implementation sources, relevant feature patterns, drift, and unresolved shared needs.

## Process

1. **Scope.** Select the affected frontend workspace before reading monorepo root configuration.
2. **Resolve.** Match the most specific active UI system scope.
   - Stop on equal or unorderable overlaps.
   - Treat shared packages as sources, not inherited scopes.
3. **Confirm.** Compare available evidence with [evidence.md](../references/evidence.md).
   - Cite paths and behavior without copying source syntax.
   - When no UI evidence exists and the request does not explicitly create an interface, report the boundary and stop.
4. **Separate.** Record an unmet shared need as a system-delta dependency.

## Test

| Case | Pass |
| --- | --- |
| Active system | its id, revision, scope, and canonical sources are named |
| Scope conflict | design stops without arbitrarily selecting a contract |
| Stale memory | repository reality is reported and memory remains unchanged |
| Shared gap | it becomes a system dependency, not a feature-local convention |
| Backend only | no interface is invented without explicit intent |
| Source evidence | it is referenced by path without markup, CSS, or framework excerpts |
