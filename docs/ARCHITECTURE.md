# 🏛️ Architecture

How the AI-Driven Dev Framework composes inside Claude Code.

## 🗺️ High-level

```mermaid
---
title: aidd-framework composition
---
flowchart TB
  subgraph User
    Editor["Claude Code session"]
  end

  subgraph Marketplace["Marketplace (this repo)"]
    Manifest[".claude-plugin/marketplace.json"]
    PluginsDir["plugins/"]
  end

  subgraph Plugins["Plugins (composable units)"]
    Context["aidd-context"]
    Dev["aidd-dev"]
    Vcs["aidd-vcs"]
    Pm["aidd-pm"]
    Orchestrator["aidd-orchestrator"]
    Refine["aidd-refine"]
    Ui["aidd-ui 🚧"]
  end

  subgraph SkillUnit["A plugin may ship (Claude Code surfaces)"]
    Skills["skills/ (SKILL.md + actions + assets)"]
    Agents["agents/"]
    Commands["commands/"]
    Hooks["hooks/ (hooks.json)"]
    Rules["rules/"]
    Mcp[".mcp.json (MCP servers)"]
  end

  Editor -->|"/plugin marketplace add"| Manifest
  Manifest -->|lists| PluginsDir
  PluginsDir --> Plugins
  Context --> SkillUnit
  Dev --> SkillUnit
  Vcs --> SkillUnit
  Pm --> SkillUnit
  Orchestrator --> SkillUnit
  Refine --> SkillUnit
  Ui --> SkillUnit
  Editor -->|"/plugin install"| Plugins
  Editor -->|invokes| Skills
```

## 🧩 Anatomy of a plugin

Every plugin under `plugins/<plugin>/` follows the same shape:

```
plugins/<plugin>/
├── .claude-plugin/
│   └── plugin.json        # manifest (name, version, description, skills[], $schema)
├── README.md              # human-facing landing page
├── CATALOG.md             # per-plugin auto-generated index
├── CHANGELOG.md           # release-please-managed
├── skills/                # router-based skills
│   └── <NN>-<name>/
│       ├── SKILL.md        # contract (name, description, actions table)
│       ├── README.md       # human-facing skill landing
│       ├── actions/        # atomic actions invoked by the router
│       ├── assets/         # templates and static files
│       └── references/     # extended docs the skill links into
├── agents/                 # named AI agents          (optional)
├── commands/               # slash commands           (optional)
├── hooks/hooks.json        # lifecycle hooks          (optional)
├── rules/                  # coding rules             (optional)
└── .mcp.json               # MCP server configuration (optional)
```

A plugin bundles **any subset** of the Claude Code surfaces (skills, agents, commands, hooks, rules, MCP servers); only `skills/` and the manifest are universal. Today the bundled plugins use skills, agents, and hooks — commands, rules, and MCP servers are supported but not yet shipped by any. Browse the [plugins](../plugins/) to see which surfaces each one ships.

Validation:

- `plugin.json` against [`claude-code-plugin-manifest`](https://www.schemastore.org/claude-code-plugin-manifest.json).
- `marketplace.json` against [`claude-code-marketplace`](https://www.schemastore.org/claude-code-marketplace.json).

Both run in the `lefthook` pre-commit hook (when the validator `pipx`/`check-jsonschema` is available). The `validate` workflow re-runs the hooks on every push and PR.

## 🪝 Bundled hooks

Three plugins ship Claude Code hooks (declared in `plugins/<plugin>/hooks/hooks.json`). They run Node, so users need `node` on their `PATH`:

| Plugin         | Event             | Runs                      | Purpose                                                        |
| -------------- | ----------------- | ------------------------- | ------------------------------------------------------------- |
| `aidd-context` | `SessionStart`    | `hooks/update_memory.js`  | Refresh the project memory block in the AI context files      |
| `aidd-pm`      | `PostToolUse`     | `hooks/check-backlog.js`  | Report structural errors after supported backlog editor writes |
| `aidd-refine`  | `UserPromptSubmit`| `hooks/condense-stats.js` | Report token savings while condensed output mode is on        |

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

`aidd-ui` ships but is **alpha** (smoke-test only, off the curated install path); it is listed here for completeness.

Three rules follow:

- **Knowledge vs execution is a firewall.** Knowledge plugins produce artifacts you *read* (docs, plans, memory) and never write or run application source - `aidd-context`'s bootstrap deliberately creates no `package.json` or source files. Real code belongs to `aidd-dev` or an orchestrator's own setup actions.
- **Concern decides placement, not existence.** A missing capability goes in the plugin whose concern owns it, then the caller delegates. Never reimplement it in the calling plugin because the right home lacks it today.
- **Orchestration = sequencing across multiple concerns** with little domain logic. Any skill may delegate a sub-step ([Cross-plugin orthogonality](#-cross-plugin-orthogonality)); doing so once does not make it an orchestrator. The orchestrator owns only glue and delegates the depth, handing off through a seam artifact (e.g. an `INSTALL.md` one plugin produces and another consumes).

## 🔀 Skills are routers

A skill's `SKILL.md` is a manifest plus an actions table. Claude Code loads the SKILL.md when the skill is invoked; the body decides which action(s) to run.

```mermaid
---
title: skill router pattern
---
flowchart LR
  User["User: 'Use skill aidd-X:NN-name'"]
  Skill["SKILL.md (router)"]
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

Each action is a self-contained markdown file with inputs, outputs, depends-on, process steps, and a test checklist. Actions can call other skills via the `Skill` tool, so a skill discovers a capability it needs at runtime (by matching skill descriptions, never by hardcoded plugin name) and delegates to it.

## 🤖 Skills and agents

- A **skill** is a caller-agnostic recipe; it runs in the context of whoever invokes it.
- An **agent** is an isolated executor; it runs in its own context and returns only a result.

Choose by context, not complexity: keep the work visible to the caller → skill; isolate it and take only the result → agent.

Composition rules:

- **Spawning is an orchestration decision, never a skill's.** A recipe skill never spawns an agent; it runs in the caller's context. Only a high-level orchestrator skill (for example the SDLC) spawns agents, and it decides per step whether to isolate the work in an agent or run the recipe inline.
- An orchestrator spawns each step as a leaf agent that runs a recipe, or runs the recipe itself when the step needs no isolation. The SDLC owns planning (runs `01-plan` in its own context) and spawns two workers: `executor` (runs `02-implement`) and `checker` (runs `05-review`). The agent is the isolation; the recipe inside it never spawns again.
- An agent invokes only the recipe skills it declares under `# Skills you may invoke`, never an orchestrator skill, and never reads a skill's files. It names a same-plugin skill by its `plugin:folder` address (deterministic); it names a cross-plugin skill by capability, per cross-plugin orthogonality.
- An agent never delegates flow work to another agent and never invokes an orchestrator skill. It may spawn a read-only recon helper (for example `Explore`) that mutates nothing and spawns nothing. So the write path stays two layers deep and delegation can never cycle.

## 🔗 Cross-plugin orthogonality

Plugins never reference each other by name — **orchestrators included**. When skill A needs a capability skill B owns, it discovers a candidate at runtime through description matching, never a hardcoded `aidd-<plugin>:…` address. This keeps the marketplace forkable, the plugins swappable, and the docs maintainable.

The rule is social (PR template checklist), not yet mechanically enforced — a lefthook grep for cross-plugin literals would catch violations (an orchestrator hardcoding a sibling skill name still slips through today).

## 🔎 See also

- [`CREATE_PLUGIN.md`](CREATE_PLUGIN.md) - build and publish your own plugin.
- [`GLOSSARY.md`](GLOSSARY.md) - terminology used across the framework.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) - contribution flow.
