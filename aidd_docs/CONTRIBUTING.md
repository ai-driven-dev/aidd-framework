# Contributing

Guidelines for adding skills, agents, rules, and templates inside your AIDD-equipped project.

## Creating New Content

Use the generator skills to scaffold new content that follows the framework structure.

| Skill                              | Creates              |
| ---------------------------------- | -------------------- |
| `aidd-context:03-context-generate` | New skill, agent, or rule (router-based, with actions) |
| `aidd-context:10-learn`            | New memory or rule capturing a learning                          |

Generator skills consume the templates inside their `assets/` folder and write the output to the correct location for your AI tool (Claude Code, Cursor, Copilot, Codex, OpenCode).

## Templates

All templates live alongside the skill that owns them, under `plugins/<plugin>/skills/<NN-name>/assets/`. They can be adapted to your team's conventions.

| Where                                              | What it scaffolds                                        |
| -------------------------------------------------- | -------------------------------------------------------- |
| `aidd-context:03-context-generate/assets/skills/`  | `SKILL.md`, action templates                             |
| `aidd-context:03-context-generate/assets/agents/`  | Agent file template                                      |
| `aidd-context:03-context-generate/assets/rules/`   | Rule file template                                       |
| `aidd-pm:03-prd/assets/`                           | PRD body template                                        |
| `aidd-pm:04-spec/assets/`                          | Spec template and validator                              |
| `aidd-pm:06-product-brief/assets/`                 | Product Brief template                                   |
| `aidd-dev:01-plan/assets/`                         | Plan and master-plan templates                           |
| `aidd-vcs:01-commit/assets/`                       | Conventional commit message template                     |
| `aidd-vcs:02-pull-request/assets/`                 | Pull/merge request body template, contributing example   |

## Syncing Across Tools

If the project uses multiple AI tools (e.g. Claude Code plus Cursor), the same content must be available to each. The memory bank is shared automatically via the `<aidd_project_memory>` block kept in sync by `aidd-context:02-project-memory`. Skills are loaded per-plugin by the runtime, so any skill installed via the marketplace is available across tools that support skills.

When tools differ in syntax (frontmatter, slash command name, references), follow the IDE mapping reference shipped with each plugin.

## Recommended Workflow

- Open a pull request for any new skill, agent, rule, or template. Visible changes that affect how the AI behaves on the project deserve team review.
- Keep skills router-pure: SKILL.md holds no business logic; everything lives inside actions.
- Stay within 5 to 10 percent deviation from a template structure. Beyond that, update the template first, then derive the new content from it.

## Recipes

Project recipes live under `aidd_docs/recipes/`. Bundled framework recipes live in the cook skill and should only be changed when contributing to the framework itself.

## Conventions

- Skill names: `<plugin>:<NN>-<slug>`. Slug is kebab-case verb for activity domains, singular noun for tool domains.
- Action files: only `## Inputs`, `## Outputs`, `## Process`, `## Test` (`## Depends on` optional).
- `## Process` steps start with `**Bold title**.` and use decision-list `Pick first match` for branching.
- `## Test` bullets start with `**Bold name**:` and are checkable (command, artifact check, or observable side effect).
- Descriptions in SKILL.md frontmatter include explicit "Use when ..." triggers and "Do NOT use for ..." exclusions.
