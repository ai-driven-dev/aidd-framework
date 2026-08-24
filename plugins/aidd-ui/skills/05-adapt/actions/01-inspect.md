# 01 - Inspect

Collect evidence for interface behavior across space, input, and platform contexts.

## Input

An interface proposal or existing interface, its UI system revision when one exists, and the relevant workspace.

## Output

Confirmed breakpoints, layout primitives, navigation changes, density, overlays, overflow, input behavior, content pressures, runtime observations, and evidence gaps.

## Process

1. **Scope.** Select the affected frontend workspace and interface regions.
2. **Read.** Inspect configuration, layout primitives, shared patterns, implementation, project-memory pointers, and the pinned UI system when one exists.
3. **Observe.** Collect space, orientation, pointer, and platform evidence required by the requested mode.
   - `define`: use requirements and repository evidence when no system exists.
   - `assess` or `confirm`: mark unobserved contexts unverified.
4. **Pressure.** Keep only evidenced long-content, localization, and density constraints.
5. **Bound.** Report drift without resolving it.

## Test

| Case | Pass |
| --- | --- |
| Breakpoint named | its system revision and repository source are cited |
| Runtime observation | context and resulting behavior are named |
| Monorepo | evidence comes from the affected frontend workspace |
| No active system | requirements and repository evidence remain usable |
| Untested context | no behavior is inferred from absence of evidence |
