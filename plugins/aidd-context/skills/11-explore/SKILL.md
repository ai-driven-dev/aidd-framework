---
name: 11-explore
description: Explore the current project across its tooling, context, and codebase. Use to survey what is installed, see what is available, or find which skill, agent, or rule fits a goal. Not for choosing the next step or running an item; it only points.
argument-hint: tooling | context | codebase | goal
---

# Explore

Surveys the current project across three axes so the user sees what is there and can dig into any of them. It maps the project, it never prescribes a next step.

## Axes

- **Tooling**: the AIDD capabilities installed, the skills, agents, commands, rules, hooks, MCP servers, and plugins. What the user can run.
- **Context**: the context layer, the memory bank, the specs and plans, and the AI context files. What the AI knows about the project.
- **Codebase**: the project itself, the stack and the high-level structure. What the project is.

## Actions

| #   | Action   | Role                                                              | Input             |
| --- | -------- | ---------------------------------------------------------------- | ----------------- |
| 01  | `survey` | Scan the three axes and present a compact map                     | project root      |
| 02  | `drill`  | Descend one axis or all, level by level, match an intent if any   | a scope or a goal |

Detect the project's AI tools first, from the signals in `references/ai-mapping.md`. Then route by what the user asked: no scope given runs `survey` for a compact map, a named axis or "all" runs `drill` straight away. Always propose the axes when the request is open, never assume one. Run each action's `## Test` before the next.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Map, never prescribe. Explore shows what is there across the axes and descends into it on request. It never tells the user the next step, that is the onboard skill's job, at any depth.
- Detect the tools before either action. A surface a tool does not have is skipped, never an error.
- Propose, then accept. Offer the axes or all when the request is open, run the user's pick directly when they name one.
- Descend one level per confirmation. Wait for the user at every level, stop at a leaf or when they are done.
- List only what is actually installed or present, never invent an item.
- Never hardcode a tool. Per-tool scan paths and formats live in `references/ai-mapping.md`.
- Point, do not run. Return an item's invocation path and stop.

## References

- `references/ai-mapping.md`: the per-tool signals, scan paths, and formats for the Tooling and Context axes.
