# Project Brief

What this project is, the problem it solves, and its domain language. The non-derivable "why", not the "how".

## What it is

- A plugin marketplace that installs structured SDLC workflows into AI coding tools — Claude Code, Cursor, GitHub Copilot, Codex, opencode — plus the `aidd` binary that installs them.
- For developers who already work with an AI assistant daily and want its output to be repeatable rather than improvised.

## Why it exists

- An AI assistant rediscovers a project on every session and improvises its process each time. The framework gives it durable project memory and a fixed set of workflows, so the same request produces comparable work twice.
- The workflows are tool-agnostic markdown. Writing them once and translating them per tool avoids maintaining a separate prompt library for each assistant.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Plugin | An installable package grouping skills around one concern, listed in `marketplace.json` |
| Skill | A router: a `SKILL.md` that dispatches a user request to its actions |
| Action | One atomic step inside a skill, with its own inputs, outputs, process and test |
| Agent | An isolated executor; runs in its own context and returns only a result |
| Rule | A coding standard injected into the tool's context automatically |
| Memory | The bank under `aidd_docs/memory/`, loaded at the start of every session |
| Marketplace | `.claude-plugin/marketplace.json`, the registry listing every plugin and its version |
| Concern | What a plugin owns; it decides where a capability lives |
| Promote | Sending `next` to `main`, which opens the release |

## Key features

- Install and update plugins per AI tool (`aidd plugin add`, `aidd ai`, `aidd ide`).
- Build a target-native distribution of the repository for one tool (`aidd framework build`).
- Bootstrap and refresh a project's memory bank, and wire it into every AI context file.
- Generate context artifacts: skills, rules, agents, commands, hooks, Mermaid diagrams.
- Run the development loop as workflows: plan, implement, assert, audit, review, test, refactor, debug.
- Manage a typed product backlog — briefs, epics, stories, specs, spikes, defects.
- Orchestrate a request end to end, from framing to a draft pull request.
- Render task documents as a board (`aidd kanban`).
