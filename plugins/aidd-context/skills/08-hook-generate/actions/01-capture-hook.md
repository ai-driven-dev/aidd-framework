# 01 - Capture hook

Clarify what fires, on what, where it goes, and for which tools before touching a file.

## Input

A free-form request to add a hook.

## Output

In-context decisions, nothing written yet:

- the lifecycle moment the hook targets
- the action it runs, and whether it needs a backing script
- the matcher, or none for every occurrence
- the scope to install into
- the confirmed tools, and any skipped with a reason
- the write mode: a host project, or a plugin source

## Process

1. **Gate.** Run the asset-access precheck ([tool-paths.md](../references/tool-paths.md)).
2. **Tools.** Detect the installed tools and confirm which to target ([tool-paths.md](../references/tool-paths.md)). Skip a tool that does not support hooks, with its reason.
3. **Moment.** Pick the narrowest lifecycle moment that fits ([hook-authoring.md](../references/hook-authoring.md)).
   - Confirm each target tool exposes that moment ([tool-paths.md](../references/tool-paths.md)). Skip a tool that lacks it, with its reason.
4. **Action.** Decide what runs at the moment, and whether it needs a backing script ([hook-authoring.md](../references/hook-authoring.md)).
5. **Matcher.** Set a matcher only when the moment must be filtered. Prefer a precise filter ([hook-authoring.md](../references/hook-authoring.md)).
6. **Scope.** Ask the user where to install: a single agent or skill component, the shared project, the project local-only, or the user's global config. Offer only the scopes the target tools support ([tool-paths.md](../references/tool-paths.md)).
   - For a component scope, name the exact skill or agent file, and confirm the moment fits a component-scoped hook ([tool-paths.md](../references/tool-paths.md)).
   - State the resolved file and confirm. Never pick silently.
7. **Write mode.** Host project, or a plugin source. For a plugin source, name the plugin.

## Test

- Every decision is stated and confirmed in writing.
- The resolved scope and file are named before any write.
- Each tool was confirmed to support the moment, or skipped with its reason.
