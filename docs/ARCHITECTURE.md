# 🏛️ Architecture

How the AI-Driven Dev Framework composes inside Claude Code.

## 🗺️ High-level

```mermaid
flowchart LR
  Editor["Claude Code session"] -->|"marketplace add"| Manifest[".claude-plugin/marketplace.json"]
  Manifest -->|lists| Plugins["plugins/*"]
  Editor -->|"plugin install"| Plugins
  Plugins -->|ships| Surfaces["skills · agents · commands · hooks · rules · .mcp.json"]
  Editor -->|invokes| Surfaces
```

## 🧩 Anatomy of a plugin

```txt
plugins/<plugin>/
├── .claude-plugin/plugin.json   # manifest (name, version, description, skills[], $schema)
├── README.md · CATALOG.md · CHANGELOG.md
├── skills/<NN>-<name>/
│   ├── SKILL.md                 # router: frontmatter, flow, actions table, transversal rules
│   ├── actions/                 # the atomic steps the router dispatches to
│   ├── assets/                  # templates and static files
│   └── references/              # one responsibility per file, linked from this skill only
├── agents/ · commands/ · hooks/hooks.json · rules/ · .mcp.json   (all optional)
```

Only `skills/` and the manifest are universal; a plugin ships any subset of the rest.

A plugin never contains its own tests: the build copies `hooks/` recursively into every user project, so a test folder there would ship to them. Tests for a bundled script live in `scripts/__tests__/`.

`plugin.json` and `marketplace.json` are validated against their [plugin](https://www.schemastore.org/claude-code-plugin-manifest.json) and [marketplace](https://www.schemastore.org/claude-code-marketplace.json) schemas, in the `lefthook` pre-commit hook and again in the `validate` workflow.

## 🪝 Bundled hooks

Declared in `plugins/<plugin>/hooks/hooks.json`. They run Node, so users need `node` on their `PATH`:

| Plugin         | Event              | Runs                      | Purpose                                                  |
| -------------- | ------------------ | ------------------------- | -------------------------------------------------------- |
| `aidd-context` | `SessionStart`     | `hooks/update_memory.js`  | Refresh the project memory block in the AI context files |
| `aidd-refine`  | `UserPromptSubmit` | `hooks/condense-stats.js` | Report token savings while condensed output mode is on   |

## 🧠 Plugin concerns and layers

Every capability lives in exactly one plugin, chosen by **concern**. This taxonomy decides placement; it is only implicit in each `plugin.json`, so it is canonical here.

| Plugin              | Concern              | Layer        |
| ------------------- | -------------------- | ------------ |
| `aidd-context`      | Knowledge production | Knowledge    |
| `aidd-pm`           | Product management   | Knowledge    |
| `aidd-refine`       | Meta-cognition       | Knowledge    |
| `aidd-dev`          | Code transformation  | Execution    |
| `aidd-vcs`          | Version control      | External     |
| `aidd-orchestrator` | Orchestration        | Coordination |
| `aidd-ui` 🚧        | UI/UX design         | Execution    |

`aidd-ui` is alpha: smoke-test only, off the curated install path.

- **Knowledge vs execution is a firewall.** Knowledge plugins produce artifacts you *read* and never write or run application source. `aidd-context`'s bootstrap deliberately creates no `package.json`. Real code belongs to `aidd-dev` or an orchestrator's own setup actions.
- **Concern decides placement, not existence.** A missing capability goes in the plugin whose concern owns it, then the caller delegates. Never reimplement it in the calling plugin because the right home lacks it today.
- **Orchestration = sequencing across concerns** with little domain logic. Delegating a sub-step once does not make a skill an orchestrator. The orchestrator owns only glue and hands off through a seam artifact, for example an `INSTALL.md` one plugin produces and another consumes.
- `aidd-orchestrator:02-backlog` owns the cross-artifact flow. Each artifact's contract stays in its `aidd-pm` skill, so a direct PM call follows the same rules as an orchestrated one.

## 🔀 Skills are routers

A skill's `SKILL.md` is a manifest plus a router. Claude Code loads the SKILL.md when the skill is invoked; the body decides which local action or orchestration protocol to run.

```mermaid
---
title: skill router pattern
---
flowchart LR
  User["User: '/skill-name'"]
  Skill["/skill-name"]
  Action1["actions/01-step.md"]
  Action2["actions/02-step.md"]
  ActionN["actions/NN-step.md"]
  Out["Outputs: files, labels, PRs, audit logs"]

  User --> Skill
  Skill -->|"choose 1..N"| Action1
  Skill -->|"choose 1..N"| Action2
  Skill -->|"choose 1..N"| ActionN
  Action1 --> Out
  Action2 --> Out
  ActionN --> Out
```

Recipe skills route to self-contained actions with inputs, outputs, process steps, and tests. An orchestrator with no domain logic may instead route through numbered reference protocols that define handoffs and delegate the work to capabilities discovered at runtime.

A skill never links outside itself. The same tree ships flat, where the skill folder is renamed `<plugin>-<skill>`, or as a marketplace, so no relative path survives both. A bundled script is named plugin-relative in backticks, never linked.

## 🤖 Skills and agents

- A **skill** is a caller-agnostic recipe; it runs in the context of whoever invokes it.
- An **agent** is an isolated executor; it runs in its own context and returns only a result.

Choose by context, not complexity: keep the work visible to the caller → skill; isolate it and take only the result → agent.

- **Spawning is authorized by the high-level orchestrator, never invented by a recipe skill.** A recipe skill normally runs in the caller's context. A bounded fan-out capability may mechanically spawn leaf agents only when the orchestrator explicitly delegates that responsibility and retains routing ownership.
- An orchestrator spawns each isolated step as a leaf agent that runs a recipe, or runs the recipe itself when isolation is unnecessary. The SDLC owns planning, delegates delivery to `executor`, and delegates independent judgments to a fresh `checker`. For independent repair findings, it may explicitly delegate bounded fan-out to `10-todo`; Todo's leaf executors return their results to the SDLC. A recipe invoked inside an agent never spawns again.
- An agent invokes only the recipe skills it declares under `# Skills you may invoke`, never an orchestrator skill, and never reads a skill's files. It names every skill by its canonical `/plugin:folder` address so its permissions are explicit and auditable.
- An agent never delegates flow work to another agent and never invokes an orchestrator skill. It may spawn a read-only recon helper (for example `Explore`) that mutates nothing and spawns nothing. So the write path stays two layers deep and delegation can never cycle.

## 🔗 Capability addressing

Address a capability only where the dispatch is declared: a router's `## Actions` table, an agent's `# Skills you may invoke` list. Everywhere else, name the concept the capability owns, never the skill that owns it.

Recipe skills never hardcode a sibling provider. They discover cross-plugin capabilities at runtime through description matching. Agent permission lists and orchestration references are responsibility maps, so they name the current provider with its canonical `/plugin:folder` or `@plugin:agent` address. The orchestrator must verify that provider is installed before calling it.

This distinction keeps recipe plugins swappable while making orchestration handoffs explicit and auditable.

## 🔎 See also

- [`CREATE_PLUGIN.md`](CREATE_PLUGIN.md) - build and publish your own plugin.
- [`GLOSSARY.md`](GLOSSARY.md) - terminology used across the framework.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) - contribution flow.
