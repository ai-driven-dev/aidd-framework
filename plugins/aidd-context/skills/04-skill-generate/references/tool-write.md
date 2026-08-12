# Write targets

Where a skill tree is written, per tool.

## Root

| Tool           | Root                             |
| -------------- | -------------------------------- |
| Claude Code    | `.claude/skills/<name>/`         |
| Cursor         | `.cursor/skills/<name>/`         |
| OpenCode       | `.opencode/skills/<name>/`       |
| GitHub Copilot | `.github/skills/<name>/`         |
| Codex CLI      | `.agents/skills/<name>/`         |
| Gemini CLI     | `.agents/skills/<name>/`         |
| Plugin source  | `plugins/<plugin>/skills/<name>/` |

## Frontmatter

Emit `description` always, `name` only where listed, drop the rest.

| Tool                   | Fields                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| Claude Code            | `name`, `description`, opt `allowed-tools`, `disable-model-invocation` |
| Cursor, GitHub Copilot | `name`, `description`, opt `allowed-tools`                             |
| OpenCode               | `description`, opt `permission` map                                   |
| Codex CLI              | `name`, `description` (strips the rest)                                |
| Gemini CLI             | `name`, `description` (strict schema, rejects the rest)                |
