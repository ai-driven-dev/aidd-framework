# Glossary

Definitions for the terms the framework uses without re-explaining each time. One paragraph per term, ordered for reading top to bottom.

## 📦 Plugin

A `plugins/<name>/` directory installable from this marketplace into Claude Code. Each plugin owns one domain (context, dev, vcs, pm, orchestrator, refine, ui), ships its own README, CATALOG, and skills, and may add any Claude Code surface: agents, commands, hooks, rules, and MCP servers (`.mcp.json`). Plugins version independently via `release-please`.

## 🏪 Marketplace

The Git repository that publishes plugins. When you run `/plugin marketplace add <owner>/<repo>` Claude Code reads `.claude-plugin/marketplace.json` and offers the listed plugins for install. This repo (`aidd-framework`) is one such marketplace and versions independently of the plugins it ships.

## 🧠 Memory bank

Per-project context files under `aidd_docs/memory/` (architecture, conventions, decisions, and similar) that give the AI durable knowledge of your codebase. Built or refreshed by `aidd-context` (the onboard / project-memory skills) and read by skills that need project context. "Onboard builds the memory bank" in the Quick start refers to this.

## 🛠️ Skill

A self-contained workflow under `plugins/<plugin>/skills/<NN-name>/`. Triggered by a user phrase, a slash command, or an explicit `Use skill <id>` invocation. A skill owns a `SKILL.md` router, one or more atomic actions, and optional `assets/` and `references/`. The `SKILL.md` `name:` is the folder slug (`00-onboard`); the invocation id is `<plugin>:<folder>`, for example `aidd-context:00-onboard`.

## 🧭 Router-based skill

The shape every skill in this framework follows. `SKILL.md` is a pure router: it lists triggers, declares `## Actions`, and dispatches through its flow. It carries no business logic. The logic lives in the action files.

## ⚡ Action

A single atomic step inside a skill, stored at `plugins/<plugin>/skills/<NN-name>/actions/NN-name.md`. Each action file contains `## Input`, `## Output`, `## Process`, and `## Test`. Tests assert observable results.

## 🤖 Agent

A specialized AI persona under `plugins/<plugin>/agents/<name>.md`. Agents are scoped and spawned by an orchestrator when a step needs isolation in a dedicated role rather than the main thread.

## 📏 Rule

A coding standard the AI loads automatically on relevant files. Rules live under each tool's rules directory (Claude Code uses `.claude/rules/`) and can be scoped via `paths:` glob frontmatter. Rules without `paths` apply to all files. Rules describe how to write code; skills describe what to do.

## 🪝 Hook

A program declared in `plugins/<plugin>/hooks/hooks.json` that Claude Code runs at lifecycle events (pre-commit, post-tool, etc.). Hooks are how a plugin triggers deterministic side effects rather than asking the model to remember.

## 🔖 Bracket ID

The short identifier in each plugin's Skills table, for example `[2.1]` for `aidd-dev:01-plan`. The first digit is the plugin ordinal; the second is the skill position inside the plugin. Bracket IDs are the stable references the per-plugin Skills tables use to point at a skill without spelling out the full id.

## 🔗 See also

- [`../README.md`](../README.md) for the marketplace overview, plugin catalog, and install flow.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) for the composition model and skill router pattern.
