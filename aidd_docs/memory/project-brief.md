# Project Brief

What this project is, the problem it solves, and its domain language. The non-derivable "why", not the "how".

## What it is

- A plugin marketplace that installs structured SDLC workflows into AI coding tools — Claude Code, Cursor, GitHub Copilot, Codex, opencode — plus the `aidd` binary that installs them.
- For developers already working with an AI assistant daily, who want its output repeatable rather than improvised.

## Why it exists

- An assistant rediscovers the project every session and improvises its process. Durable memory plus fixed workflows make the same request produce comparable work twice.
- Workflows are tool-agnostic markdown: written once, translated per tool, instead of one prompt library per assistant.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Plugin | installable package grouping skills around one concern, listed in `marketplace.json` |
| Skill | a router: `SKILL.md` dispatching a request to its actions |
| Action | one atomic step, with its own inputs, outputs, process and test |
| Agent | isolated executor; own context, returns only a result |
| Rule | coding standard injected into the tool's context automatically |
| Memory | the bank under `aidd_docs/memory/`, loaded every session |
| Marketplace | `.claude-plugin/marketplace.json`, the plugin and version registry |
| Concern | what a plugin owns; decides where a capability lives |
| Promote | sending `next` to `main`, which opens the release |

## Key features

| Capability | Entry |
| --- | --- |
| Install and update plugins per tool | `aidd plugin add`, `aidd ai`, `aidd ide` |
| Build a target-native distribution | `aidd framework build` |
| Bootstrap and refresh project memory | `aidd-context:02-project-memory` |
| Generate context artifacts | `aidd-context:03-context-generate` and its per-kind generators |
| Development loop | `aidd-dev` — plan, implement, assert, audit, review, test, refactor, debug |
| Typed product backlog | `aidd-pm` — brief, epic, story, spec, spike, defect |
| End-to-end orchestration | `aidd-orchestrator:01-sdlc` |
| Task board | `aidd kanban` |
