# 01 - Inspect

Locate the actual interface system and its maturity in the relevant workspace.

## Input

The project root, target workspace, and optional new interface need.

## Output

An evidence map for styling architecture, tokens, layout primitives, shared components and states, forms, navigation, motion, breakpoints, and accessibility conventions.

## Process

1. **Scope.** Resolve the frontend workspace from the target interface rather than the root manifest alone.
2. **Read.** Start with UI project memory, then confirm relevant claims in themes, tokens, styles, configuration, shared components, and repeated screens.
3. **Classify.** Describe the system as mature, partial, ad hoc, absent, or conflicting, with evidence paths.
4. **Compare.** Report stale or unconfirmed memory and direct its correction to a separate project-memory refresh without editing it.

## Test

| Case | Pass |
| --- | --- |
| System evidence | every convention names a source path |
| Partial system | coherent surfaces and gaps are distinguished |
| Conflicting patterns | each pattern is evidenced and dominance is stated only when supported |
| Missing memory | inspection completes from repository evidence |
| Stale memory | repository reality wins, a separate project-memory refresh is named, and memory remains unchanged |
