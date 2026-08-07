# aidd-context catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-context` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`hooks`](#hooks)
- [`skills`](#skills)
  - [`skills/00-onboard`](#skills00-onboard)
  - [`skills/01-bootstrap`](#skills01-bootstrap)
  - [`skills/02-project-memory`](#skills02-project-memory)
  - [`skills/03-context-generate`](#skills03-context-generate)
  - [`skills/04-skill-generate`](#skills04-skill-generate)
  - [`skills/05-rule-generate`](#skills05-rule-generate)
  - [`skills/06-agent-generate`](#skills06-agent-generate)
  - [`skills/07-command-generate`](#skills07-command-generate)
  - [`skills/08-hook-generate`](#skills08-hook-generate)
  - [`skills/09-mermaid`](#skills09-mermaid)
  - [`skills/10-learn`](#skills10-learn)
  - [`skills/11-explore`](#skills11-explore)
  - [`skills/12-cook`](#skills12-cook)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `hooks`

| File |
|------|
| [hooks.json](hooks/hooks.json) |
| [update_memory.js](hooks/update_memory.js) |

### `skills`

#### `skills/00-onboard`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-scan.md](skills/00-onboard/actions/01-scan.md) | - |
| `actions` | [02-assess.md](skills/00-onboard/actions/02-assess.md) | - |
| `actions` | [03-present.md](skills/00-onboard/actions/03-present.md) | - |
| `actions` | [04-run.md](skills/00-onboard/actions/04-run.md) | - |
| `assets` | [banner.txt](skills/00-onboard/assets/banner.txt) | - |
| `assets` | [report.md](skills/00-onboard/assets/report.md) | - |
| `references` | [flow.md](skills/00-onboard/references/flow.md) | - |
| `-` | [SKILL.md](skills/00-onboard/SKILL.md) | `Guide a project's journey through AIDD, from first setup to shipping a feature. Use when the user says onboard me, where do I start, or what to do next. Not for listing every installed surface.` |

#### `skills/01-bootstrap`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-gather-needs.md](skills/01-bootstrap/actions/01-gather-needs.md) | - |
| `actions` | [02-propose-candidates.md](skills/01-bootstrap/actions/02-propose-candidates.md) | - |
| `actions` | [03-audit-candidates.md](skills/01-bootstrap/actions/03-audit-candidates.md) | - |
| `actions` | [04-pick-and-design.md](skills/01-bootstrap/actions/04-pick-and-design.md) | - |
| `actions` | [05-write-install-md.md](skills/01-bootstrap/actions/05-write-install-md.md) | - |
| `assets` | [checklist.md](skills/01-bootstrap/assets/checklist.md) | - |
| `assets` | [install-template.md](skills/01-bootstrap/assets/install-template.md) | - |
| `references` | [stack-heuristics.md](skills/01-bootstrap/references/stack-heuristics.md) | - |
| `-` | [SKILL.md](skills/01-bootstrap/SKILL.md) | `Design and validate a new SaaS's architecture into an INSTALL.md via Q&A and stack comparison. Use when the user starts a project, chooses a stack, or picks an architecture pattern. Not for editing an existing stack or scaffolding code.` |

#### `skills/02-project-memory`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-scan.md](skills/02-project-memory/actions/01-scan.md) | - |
| `actions` | [02-generate.md](skills/02-project-memory/actions/02-generate.md) | - |
| `actions` | [03-sync.md](skills/02-project-memory/actions/03-sync.md) | - |
| `actions` | [04-test-prompt.md](skills/02-project-memory/actions/04-test-prompt.md) | - |
| `assets` | [AGENTS.md](skills/02-project-memory/assets/AGENTS.md) | - |
| `assets` | [CONTRIBUTING.md](skills/02-project-memory/assets/CONTRIBUTING.md) | - |
| `assets` | [GUIDELINES.md](skills/02-project-memory/assets/GUIDELINES.md) | - |
| `assets` | [README.md](skills/02-project-memory/assets/README.md) | - |
| `assets` | [report.md](skills/02-project-memory/assets/report.md) | - |
| `references` | [capability-signals.md](skills/02-project-memory/references/capability-signals.md) | - |
| `references` | [memory-destinations.md](skills/02-project-memory/references/memory-destinations.md) | - |
| `references` | [memory-rules.md](skills/02-project-memory/references/memory-rules.md) | - |
| `references` | [review-protocol.md](skills/02-project-memory/references/review-protocol.md) | - |
| `references` | [structure.md](skills/02-project-memory/references/structure.md) | - |
| `references` | [tools.md](skills/02-project-memory/references/tools.md) | - |
| `-` | [SKILL.md](skills/02-project-memory/SKILL.md) | `Build the project's memory of its architecture, conventions, and decisions, and wire it into the tools you use. Use to set up or refresh project memory. Not for editing one existing memory file.` |

#### `skills/03-context-generate`

| File | Description |
|------|---|
| [SKILL.md](skills/03-context-generate/SKILL.md) | `Route a request to generate a context artifact (skill, rule, agent, command, or hook) to its generator when the kind is unnamed. A named kind triggers its generator directly. Not for listing existing artifacts.` |

#### `skills/04-skill-generate`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-scope.md](skills/04-skill-generate/actions/01-scope.md) | - |
| `actions` | [02-plan.md](skills/04-skill-generate/actions/02-plan.md) | - |
| `actions` | [03-write.md](skills/04-skill-generate/actions/03-write.md) | - |
| `actions` | [04-validate.md](skills/04-skill-generate/actions/04-validate.md) | - |
| `assets` | [action-template.md](skills/04-skill-generate/assets/action-template.md) | - |
| `assets` | [skill-template.md](skills/04-skill-generate/assets/skill-template.md) | `<what it produces>. Use when the user wants to <intents>. <Not for X when needed.>` |
| `references` | [naming.md](skills/04-skill-generate/references/naming.md) | - |
| `references` | [review-protocol.md](skills/04-skill-generate/references/review-protocol.md) | - |
| `references` | [scope-frame.md](skills/04-skill-generate/references/scope-frame.md) | - |
| `references` | [skill-authoring.md](skills/04-skill-generate/references/skill-authoring.md) | - |
| `references` | [skill-tree.md](skills/04-skill-generate/references/skill-tree.md) | - |
| `references` | [tool-detect.md](skills/04-skill-generate/references/tool-detect.md) | - |
| `references` | [tool-write.md](skills/04-skill-generate/references/tool-write.md) | - |
| `-` | [SKILL.md](skills/04-skill-generate/SKILL.md) | `Generate a router-based skill across the host AI tools a project uses. Use when the user wants to create, scaffold, or refactor a skill, or turn a workflow into one. Not for other artifacts like rules, agents, commands, hooks.` |

#### `skills/05-rule-generate`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-capture-rule.md](skills/05-rule-generate/actions/01-capture-rule.md) | - |
| `actions` | [02-write-rule.md](skills/05-rule-generate/actions/02-write-rule.md) | - |
| `actions` | [03-validate.md](skills/05-rule-generate/actions/03-validate.md) | - |
| `assets` | [rule-template.md](skills/05-rule-generate/assets/rule-template.md) | - |
| `references` | [rule-authoring.md](skills/05-rule-generate/references/rule-authoring.md) | - |
| `references` | [tool-paths.md](skills/05-rule-generate/references/tool-paths.md) | - |
| `-` | [SKILL.md](skills/05-rule-generate/SKILL.md) | `Generate a coding rule that governs editor and agent behavior across the host AI tools. Use when the user wants to write, add, or refactor a rule, convention, or coding standard. Not for other artifacts like skills, agents, or hooks.` |

#### `skills/06-agent-generate`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-capture-agent.md](skills/06-agent-generate/actions/01-capture-agent.md) | - |
| `actions` | [02-write-agent.md](skills/06-agent-generate/actions/02-write-agent.md) | - |
| `actions` | [03-validate.md](skills/06-agent-generate/actions/03-validate.md) | - |
| `assets` | [agent-template.md](skills/06-agent-generate/assets/agent-template.md) | `<what it does + when to use>  # required, third person` |
| `references` | [agent-authoring.md](skills/06-agent-generate/references/agent-authoring.md) | - |
| `references` | [tool-paths.md](skills/06-agent-generate/references/tool-paths.md) | - |
| `-` | [SKILL.md](skills/06-agent-generate/SKILL.md) | `Generate an agent across the host AI tools a project uses. Use when the user wants to create, scaffold, or refactor an agent, subagent or specialized role. Not for other artifacts like skills, rules, commands, hooks.` |

#### `skills/07-command-generate`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-capture-command.md](skills/07-command-generate/actions/01-capture-command.md) | - |
| `actions` | [02-write-command.md](skills/07-command-generate/actions/02-write-command.md) | - |
| `actions` | [03-validate.md](skills/07-command-generate/actions/03-validate.md) | - |
| `assets` | [command-template.md](skills/07-command-generate/assets/command-template.md) | - |
| `references` | [command-authoring.md](skills/07-command-generate/references/command-authoring.md) | - |
| `references` | [tool-paths.md](skills/07-command-generate/references/tool-paths.md) | - |
| `-` | [SKILL.md](skills/07-command-generate/SKILL.md) | `Generate a flat slash command across the host AI tools a project uses. Use when the user wants to create, scaffold, or refactor a one-shot slash command. Not for multi-step skills or other artifacts like rules, agents, hooks.` |

#### `skills/08-hook-generate`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-capture-hook.md](skills/08-hook-generate/actions/01-capture-hook.md) | - |
| `actions` | [02-write-hook.md](skills/08-hook-generate/actions/02-write-hook.md) | - |
| `actions` | [03-validate.md](skills/08-hook-generate/actions/03-validate.md) | - |
| `assets` | [hook-script-template.sh](skills/08-hook-generate/assets/hook-script-template.sh) | - |
| `assets` | [hook-template.json](skills/08-hook-generate/assets/hook-template.json) | - |
| `references` | [hook-authoring.md](skills/08-hook-generate/references/hook-authoring.md) | - |
| `references` | [tool-paths.md](skills/08-hook-generate/references/tool-paths.md) | - |
| `-` | [SKILL.md](skills/08-hook-generate/SKILL.md) | `Generate a hook, a handler that runs at a lifecycle event, across the host AI tools. Use when the user wants to create, scaffold, or refactor a hook, or automate an action at a lifecycle point. Not for other artifacts like skills or rules.` |

#### `skills/09-mermaid`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-mermaid.md](skills/09-mermaid/actions/01-mermaid.md) | - |
| `references` | [mermaid-conventions.md](skills/09-mermaid/references/mermaid-conventions.md) | - |
| `-` | [SKILL.md](skills/09-mermaid/SKILL.md) | `Generate a valid Mermaid diagram from a written source through a plan, generate, review loop. Use when the user wants to turn an architecture, lifecycle, or flow into a Mermaid diagram. Not for other diagram formats or image rendering.` |

#### `skills/10-learn`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-source.md](skills/10-learn/actions/01-source.md) | - |
| `actions` | [02-gather.md](skills/10-learn/actions/02-gather.md) | - |
| `actions` | [03-assess.md](skills/10-learn/actions/03-assess.md) | - |
| `actions` | [04-write.md](skills/10-learn/actions/04-write.md) | - |
| `actions` | [05-sync.md](skills/10-learn/actions/05-sync.md) | - |
| `assets` | [adr-template.md](skills/10-learn/assets/adr-template.md) | - |
| `assets` | [learning-packet.md](skills/10-learn/assets/learning-packet.md) | - |
| `references` | [assessment.md](skills/10-learn/references/assessment.md) | - |
| `references` | [destinations.md](skills/10-learn/references/destinations.md) | - |
| `references` | [gather-protocol.md](skills/10-learn/references/gather-protocol.md) | - |
| `references` | [review-protocol.md](skills/10-learn/references/review-protocol.md) | - |
| `references` | [sources.md](skills/10-learn/references/sources.md) | - |
| `references` | [sync-arguments.md](skills/10-learn/references/sync-arguments.md) | - |
| `-` | [SKILL.md](skills/10-learn/SKILL.md) | `Capture durable project learnings. Use when the user asks to remember, record, or formalize a decision, convention, lesson, pitfall, reusable workflow, or review finding. Not for preferences or temporary notes.` |

#### `skills/11-explore`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-survey.md](skills/11-explore/actions/01-survey.md) | - |
| `actions` | [02-drill.md](skills/11-explore/actions/02-drill.md) | - |
| `references` | [ai-mapping.md](skills/11-explore/references/ai-mapping.md) | - |
| `-` | [SKILL.md](skills/11-explore/SKILL.md) | `Explore the current project across its tooling, context, and codebase. Use to survey what is installed, see what is available, or find which skill, agent, or rule fits a goal. Not for choosing the next step or running an item; it only points.` |

#### `skills/12-cook`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-list.md](skills/12-cook/actions/01-list.md) | - |
| `actions` | [02-upsert.md](skills/12-cook/actions/02-upsert.md) | - |
| `actions` | [03-research.md](skills/12-cook/actions/03-research.md) | - |
| `actions` | [04-apply.md](skills/12-cook/actions/04-apply.md) | - |
| `assets` | [recipe-template.md](skills/12-cook/assets/recipe-template.md) | - |
| `assets` | [research-checklist.md](skills/12-cook/assets/research-checklist.md) | - |
| `assets` | [research-goal-checklist.md](skills/12-cook/assets/research-goal-checklist.md) | - |
| `references` | [recipe-contract.md](skills/12-cook/references/recipe-contract.md) | - |
| `references` | [recipe-locations.md](skills/12-cook/references/recipe-locations.md) | - |
| `references` | [research-playbook.md](skills/12-cook/references/research-playbook.md) | - |
| `-` | [SKILL.md](skills/12-cook/SKILL.md) | `Manage project recipes/how-to sheets by listing, creating, updating, researching, or applying a recipe. Use for recipe, cook, /cook, list, new, update, research, apply.` |

