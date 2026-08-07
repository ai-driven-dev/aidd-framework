← [aidd-framework](../../README.md)

# aidd-context

Knowledge production plugin for the AI-Driven Development framework.

> Status: stable.

First time? Install with `/plugin install aidd-context@aidd-framework`, then run `aidd-context:00-onboard`.

Covers project bootstrap, the project memory bank, generation of context artifacts (skills, agents, rules, commands, hooks), Mermaid diagrams, learning, project exploration, recipes, and a plain-language onboarding guide.

## Skills

| Bracket ID | Skill          | Description                                                                                                                                                     |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1.0]      | [onboard](skills/00-onboard/SKILL.md)                 | Guide the user through the AIDD flow on the current project, in plain language, and suggest the next logical step, adapted to the installed plugins.            |
| [1.1]      | [bootstrap](skills/01-bootstrap/SKILL.md)             | Imagine and validate the technical architecture of a new SaaS through interactive Q&A, candidate-stack comparison, multi-agent audit, and an INSTALL.md output. |
| [1.2]      | [project-memory](skills/02-project-memory/SKILL.md)       | Initialize or refresh the project memory bank from a capability-based model, and carry the memory block into the AI context files.                              |
| [1.3]      | [context-generate](skills/03-context-generate/SKILL.md) | Generate context artifacts: router-based skills, agents, rules, slash commands, hooks, plugin scaffolds, and plugin marketplaces.                               |
| [1.4]      | [mermaid](skills/09-mermaid/SKILL.md)                 | Generate high-quality Mermaid diagrams from markdown content using a structured plan-validate workflow.                                                         |
| [1.5]      | [learn](skills/10-learn/SKILL.md)                     | Capture durable learnings from the conversation or git history, score each, and route the worthwhile ones to memory, a decision record, a rule, or a new skill. |
| [1.6]      | [explore](skills/11-explore/SKILL.md)                 | Survey the project across three axes (tooling, context, codebase), then drill into one axis and point to the best-matching item for a goal.                      |
| [1.7]      | [cook](skills/12-cook/SKILL.md)                       | Maintain project and bundled recipes: list, research, create/update, apply, or validate one or all.                                                        |

## Onboarding

New to AIDD, or unsure what to run next? Invoke `aidd-context:00-onboard`. The skill:

1. Reads the project silently: the memory bank, the code and stack, any spec or plan, and which AIDD plugins are installed.
2. Explains in plain language where the project sits in the AIDD flow and suggests the next logical step, resolved to a skill that is actually installed, then offers a short numbered menu.
3. Loops back to reading the project after each step so the guidance always reflects the current state.

Onboard adapts to whatever plugins are installed: it suggests by function and discovers the skills that fill each step, so a skill added later shows up on its own.
