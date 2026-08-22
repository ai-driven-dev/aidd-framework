# 01 - Inspect

Map the responsive conventions and relevant content pressures of the interface.

## Input

An interface proposal or existing interface plus its relevant workspace.

## Output

Evidence for existing breakpoints, layout primitives, navigation changes, density rules, overlays, overflow, touch behavior, and target content pressures.

## Process

1. **Scope.** Select the affected frontend workspace and interface regions.
2. **Read.** Confirm project-memory claims in configuration, layout primitives, shared components, and repeated screens.
3. **Observe.** Use available narrow and wide runtime states, then mark unobserved behavior explicitly.
4. **Pressure.** Include relevant long content, localization, zoom, input method, and data-density constraints from requirements or evidence.

## Test

| Case | Pass |
| --- | --- |
| Breakpoint named | its repository source is cited |
| Runtime observation | viewport or input context and resulting behavior are named |
| Memory conflict | current repository evidence wins and memory remains unchanged |
| Monorepo | conventions come from the affected frontend workspace |
