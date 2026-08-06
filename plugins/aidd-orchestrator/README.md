← [aidd-framework](../../README.md)

# aidd-orchestrator

Orchestration plugin for the AI-Driven Development framework.

> Status: stable for synchronous SDLC, `async-dev`, and backlog orchestration.

First time? Install with `/plugin install aidd-orchestrator@aidd-framework`, then run `aidd-orchestrator:01-sdlc`. For async automation, run `aidd-orchestrator:00-async-dev` with `action=setup`. New to the framework? See the [quick start](../../README.md#-quick-start).

Composes capabilities into deterministic, auditable flows. Domain skills retain their own validation.

## Skills

### Use case: `sdlc`

| Bracket ID | Skill | Description |
|------------|-------|-------------|
| [6.1] | [sdlc](skills/01-sdlc/SKILL.md) | Autonomous orchestration through framing, delivery, independent review, outcome challenge, and PR creation. |

### Use case: `async-dev`

| Bracket ID | Skill | Description |
|------------|-------|-------------|
| [6.0] | [async-dev](skills/00-async-dev/SKILL.md) | Single router-based skill covering the full pipeline — setup, run, and review — selected by `$ARGUMENTS` keyword, trigger source, repo state, or natural-language intent. |

See the [skill's SKILL.md](skills/00-async-dev/SKILL.md) for the sub-flow inventory and invocation contract.

### Use case: `backlog`

| Bracket ID | Skill | Description |
|------------|-------|-------------|
| [6.2] | [backlog](skills/02-backlog/SKILL.md) | Route backlog intake, refinement, lifecycle events, review, and repair across PM capabilities. |

### Roadmap

| Use case | Direction |
|----------|-----------|
| `agentic-orchestration` | Multi-agent coordination - sub-agents, hand-offs, supervision. |
| `flow-orchestration` | Conditional / branching pipelines - human gates, fallbacks, retries. |
