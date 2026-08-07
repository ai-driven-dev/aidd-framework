# Contributing

Guidelines for adding skills, agents, rules, and templates inside your AIDD-equipped project.

## Creating New Content

Never hand-write a context artifact. Run its generator: it applies the contract, fills the template, and writes to the right place for every AI tool the project uses (Claude Code, Cursor, Copilot, Codex, OpenCode).

| Artifact                     | Run                                |
| ---------------------------- | ---------------------------------- |
| Skill, new or modified       | `aidd-context:04-skill-generate`   |
| Rule                         | `aidd-context:05-rule-generate`    |
| Agent                        | `aidd-context:06-agent-generate`   |
| Command                      | `aidd-context:07-command-generate` |
| Hook                         | `aidd-context:08-hook-generate`    |
| Any of the above, kind unclear | `aidd-context:03-context-generate` |
| A memory or rule from a learning | `aidd-context:10-learn`        |

`04-skill-generate` takes `create` or `modify`. Editing a skill by hand bypasses the contract and the validation pass, so route the edit through `modify` instead.

## Templates

Every template lives beside the skill that owns it, under `plugins/<plugin>/skills/<NN-name>/assets/`, and is filled by one of that skill's actions. Adapt a template to your team's conventions, then let the generator derive from it.

The skill contract itself lives in one file: `aidd-context:04-skill-generate/references/skill-authoring.md`. It is the only place that states what a router, an action, and a reference may hold.

## Syncing Across Tools

If the project uses multiple AI tools (e.g. Claude Code plus Cursor), the same content must be available to each. The memory bank is shared automatically via the `<aidd_project_memory>` block kept in sync by `aidd-context:02-project-memory`. Skills are loaded per-plugin by the runtime, so any skill installed via the marketplace is available across tools that support skills.

When tools differ in syntax (frontmatter, slash command name, references), follow the IDE mapping reference shipped with each plugin.

## Recommended Workflow

- Open a pull request for any new skill, agent, rule, or template. Visible changes that affect how the AI behaves on the project deserve team review.
- Deviating from a template means the template is wrong. Fix the template first, then derive the content from it.

## Recipes

Project recipes live under `aidd_docs/recipes/`. Bundled framework recipes live in the cook skill and should only be changed when contributing to the framework itself.
