# AI-Driven Dev Docs

AIDD structures your AI coding assistant with skills, agents, rules, and a memory bank so it produces consistent, high-quality work, regardless of which AI tool you use (Claude Code, Cursor, Copilot, Codex, OpenCode).

- [What You Get](#what-you-get)
  - [Concepts](#concepts)
  - [Plugins](#plugins)
  - [Framework Structure](#framework-structure)
  - [Memory Block Lifecycle](#memory-block-lifecycle)
- [Installation](#installation)
- [Typical Workflow](#typical-workflow)
- [Optional: Async Automation](#optional-async-automation)
- [Validation Rules](#validation-rules)
- [References](#references)

---

## What You Get

A plugin marketplace of skills, agents, rules, templates, and a memory system. You invoke skills through your AI tool (slash command, MCP, or natural language trigger) and the AI follows structured workflows instead of guessing.

### Concepts

| Block     | Location                                          | What it does                                                                          |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Memory    | `aidd_docs/memory/`                               | Project context the AI reads on every conversation                                    |
| Recipes   | `aidd_docs/recipes/`                              | Project-specific how-to sheets created by the cook skill                              |
| Skills    | plugin `skills/` folders                          | Router-based workflows triggered by user phrases or slashes                           |
| Commands  | tool-specific commands dir (when supported)       | Plain slash commands (no router); used for shortcuts and simple flows. None currently shipped by AIDD; reserved for future plugins or your own additions |
| Agents    | plugin `agents/` folders                          | Specialized AI personas for focused tasks                                             |
| Rules     | tool-specific rules dir (see your AI tool docs)   | Coding standards the AI follows automatically                                         |
| Templates | plugin `assets/` folders                          | Scaffolding for new skills, rules, agents                                             |

### Plugins

Skills are grouped into plugins by domain. Install only the plugins you need.

| Plugin            | Purpose                                                                            | Example skills                                              |
| ----------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| aidd-context      | Bootstrap, project init, generation of context artifacts (skills, agents, rules, commands, hooks, plugins, marketplaces), mermaid diagrams, learn, discovery | `02-project-memory`, `03-context-generate`, `09-mermaid`      |
| aidd-refine       | Meta-cognition: brainstorm, challenge prior work, condensed communication mode     | `01-brainstorm`, `02-challenge`, `03-condense`              |
| aidd-pm           | Backlog orchestration, refinement, Product Briefs, Epics, User Stories, Tasks, Spikes, Defects, requirements, and specs | `00-backlog`, `02-user-stories`, `05-spike`, `07-epic`, `08-three-amigos`, `09-defect`, `10-task` |
| aidd-dev          | Code transformation: Dev SDLC orchestrator, plan, implement, assert, audit, review, test, refactor, debug, for-sure | `00-sdlc`, `01-plan`, `02-implement`, `05-review`, `06-test` |
| aidd-vcs          | VCS workflows: commit, pull/merge request, release tag, issue creation             | `01-commit`, `02-pull-request`, `04-issue-create`           |
| aidd-orchestrator | Async orchestration of the SDLC on labeled issues (optional, extra)                | `00-async-dev` (router with setup / run / review sub-flows) |

> See the [CATALOG](../docs/CATALOG.md) for the exhaustive list of skills and actions.

### Framework Structure

AIDD installs alongside your code. Each AI tool's configuration directory holds the skills, agents, and rules it can load. Shared docs and memory live under `aidd_docs/`.

```text
my-project/
├── .claude/                     # Claude Code: skills, agents, rules, hooks
├── .cursor/                     # Cursor: skills, agents, rules
├── .github/copilot-instructions.md   # GitHub Copilot
├── AGENTS.md                    # Cursor, Codex, OpenCode (shared)
├── CLAUDE.md                    # Claude Code
├── aidd_docs/
│   ├── memory/                  # Project context (loaded each conversation)
│   │   ├── internal/            #   AIDD workflow traces (learn captures, audit notes)
│   │   ├── external/            #   External documentation references
│   │   ├── architecture.md
│   │   ├── codebase-map.md
│   │   ├── coding-assertions.md
│   │   ├── deployment.md
│   │   ├── project-brief.md
│   │   ├── testing.md
│   │   └── vcs.md
│   ├── internal/
│   │   └── decisions/           # Decision records written by aidd-context:10-learn
│   ├── backlog/                  # Local Epics, User Stories, Tasks, Spikes, and Defects
│   ├── tasks/                   # Specs, plans, run summaries
│   ├── recipes/                 # Project-specific cook recipes
│   ├── ADR.md                   # Architecture decision log (aidd-context:10-learn)
│   ├── README.md                # This file
│   ├── GUIDELINES.md            # Developer operating guidelines
│   └── CONTRIBUTING.md          # How to add or modify skills, agents, rules
├── src/                         # Your application code
└── tests/
```

### Memory Block Lifecycle

Each AI context file (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, etc.) contains an `<aidd_project_memory>` block. It is:

1. **Seeded** the first time by `aidd-context:02-project-memory` (the skill creates the block if absent).
2. **Kept in sync** automatically by a session-start hook (`aidd-context/hooks/update_memory.js`) that scans `aidd_docs/memory/` and writes the current list of `.md` files into the block.

You never edit the block by hand. To change what the AI sees, add or remove files under `aidd_docs/memory/`; the hook picks them up at the next session.

---

## Installation

AIDD is delivered as a plugin marketplace. Pick what you need; do not install everything.

- **Remote marketplace** (default): add the AIDD marketplace via your AI tool's plugin manager, then install only the plugins your project actually uses (e.g. `aidd-context` + `aidd-dev` + `aidd-vcs`).
- **Local marketplace**: clone the AIDD framework repo and point your AI tool's plugin manager at the local folder. Useful for offline work, custom forks, or contributing to the framework.

| Plugin       | Skills                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| aidd-context | 00-onboard, 01-bootstrap, 02-project-memory, 03-context-generate, 09-mermaid, 10-learn, 11-explore                    |
| aidd-refine  | 01-brainstorm, 02-challenge, 03-condense, 04-shadow-areas, 05-fact-check                                            |
| aidd-dev     | 00-sdlc, 01-plan, 02-implement, 03-assert, 04-audit, 05-review, 06-test, 07-refactor, 08-debug, 09-for-sure         |
| aidd-vcs     | 01-commit, 02-pull-request, 03-release-tag, 04-issue-create                                                         |
| aidd-pm      | 00-backlog, 01-ticket-info, 02-user-stories, 03-prd, 04-spec, 05-spike, 06-product-brief, 07-epic, 08-three-amigos, 09-defect |

Each plugin is independently installable; install incrementally. Smaller surface, fewer triggers competing.

## Typical Workflow

A typical change cycles through skills from several plugins. The order below is indicative; skip what you do not need and loop back as the work demands.

1. **Bootstrap** (only for a brand-new project): `aidd-context:01-bootstrap` imagines the stack and architecture, comparing candidate stacks and writing an `INSTALL.md`. Skip this step on an existing project.
2. **Project init** (once per project, re-runnable to refresh): `aidd-context:02-project-memory` scaffolds `aidd_docs/`, the memory bank, and the AI context files for the tools you use. Re-running later refreshes the scaffold without overwriting your customizations.
3. **Frame the request**: use `aidd-refine:01-brainstorm` to clarify, then `aidd-pm:00-backlog` to route product artifacts, refinement, and lifecycle changes.
4. **Plan**: `aidd-dev:01-plan` produces the technical plan, component behavior model, or design-image extraction.
5. **Implement and assert**: `aidd-dev:02-implement` writes code against the plan; `aidd-dev:03-assert` verifies the result.
6. **Review**: `aidd-dev:05-review` for code and functional review; `aidd-refine:02-challenge` to stress-test the result.
7. **Test**: `aidd-dev:06-test` adds or runs tests and validates user journeys.
8. **Document and learn**: `aidd-context:09-mermaid` for diagrams; `aidd-context:10-learn` to feed insights back into the memory bank or rules.
9. **Ship**: `aidd-vcs:01-commit`, `aidd-vcs:02-pull-request`, then `aidd-vcs:03-release-tag` when the work is in production. File issues with `aidd-vcs:04-issue-create`.
10. **Refactor and maintain**: `aidd-dev:07-refactor` for performance or security, `aidd-dev:04-audit` for technical-debt sweeps, `aidd-dev:08-debug` to reproduce and fix bugs.

When you want the whole synchronous pipeline run in one go (spec, plan, implementation, finalize), invoke `aidd-dev:00-sdlc`.

---

## Optional: Async Automation

Beyond the synchronous path above, `aidd-orchestrator` runs the SDLC asynchronously on labeled issues (webhook or cron). This is extra: most projects do not need it. Use only when you want the AI to pick up `to-implement` issues without a human pressing a key.

Inside the synchronous path, `aidd-dev:00-sdlc` is the Dev SDLC orchestrator that drives spec, plan, implementation, finalize in one go when you want the whole pipeline at once.

---

## Validation Rules

- Skills route through an `## Actions` table and keep shared constraints under `## Transversal rules`.
- Actions use `## Input`, `## Output`, `## Process`, and `## Test`.
- Tests must be observable: command, artifact check, or side effect.

---

## References

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding or modifying skills, agents, and rules.

External:

- Anthropic, Prompt engineering overview: <https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview>
- Anthropic, Claude Code memory: <https://docs.claude.com/en/docs/claude-code/memory>
- OpenAI, Prompt engineering best practices: <https://help.openai.com/en/articles/6654000-best-practices-for-prompting>
- GitHub Docs, Repository custom instructions for Copilot: <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/adding-repository-custom-instructions-for-github-copilot>
