---
status: cancelled
---

# Instruction: One build mode per tool — CANCELLED

This phase was going to remove flat build mode for claude, cursor, copilot and codex, keeping it
only for OpenCode, on the grounds that their flat cells duplicated their native mode and cost 831
lines.

**The premise was wrong, and checking it before executing is what caught it.**

## Why it was wrong

Two different axes were conflated.

- `PluginsCapability.mode` (`native` | `flat`) describes how a **plugin** is installed into a tool.
  Four tools of five declare `native`.
- `FrameworkBuildMode` (`marketplace` | `flat`) describes how the **framework** is built for a
  target. That is a separate setting, and the measurement about plugin installation said nothing
  about it.

The build golden settles it. For claude:

| cell | files | shape |
|---|---|---|
| `claude` | 198 | `.claude-plugin/marketplace.json` + `plugins/<name>/…`, a distributable marketplace tree |
| `claude:flat` | 189 | `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`, materialized into the tool's own directories with plugin names flattened into filenames |

Not duplicates. One produces a marketplace, the other puts the framework straight into the tool's
config directory with no marketplace indirection.

And it is documented. `cli/README.md` describes `--flat` in four places, including:

> Flat (`--flat`) — materializes plugin content directly under the tool's workspace config
> directory (e.g. `.claude/`, `.cursor/`), with no marketplace indirection. For tools without native
> marketplace support, **or when you want files on disk in the project**.

That last clause is the second use case, and it applies to every tool, native or not.

## What this changes elsewhere

- The nine build cells stay. `framework build`'s golden keeps all nine.
- The 831 lines of flat-specific code stay: `flat-build-strategy`, `flat-hooks-merge`,
  `mode-b-flat-materialization-translator`, `flat-paths`.
- Phase 2's `--flat` smoke coverage keeps its value, but for a different reason: it exercises a
  documented mode that nothing covered before, not a "before" for a removal.
- The plan loses a deletion phase. Phases 6 onwards are unaffected — none depended on this one.

## What to keep from it

One finding survives and belongs to phase 6, which already carries it:
`built-tree-materialization-translator.ts:62` re-derives `"flat"` from `toolId === "opencode"`
instead of reading `mode` off the tool profile. That is about **plugin materialization**, the axis
this phase confused with build mode, and it is a genuine defect regardless.
