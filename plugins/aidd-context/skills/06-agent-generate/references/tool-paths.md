# Tool paths (agents)

The per-tool agent path and the gate every run executes before writing. Agent slice only, nothing about skills, rules, commands, hooks, plugins, or marketplaces.

## Agent path per tool

| Tool           | Path                             | Format                 |
| -------------- | -------------------------------- | ---------------------- |
| Claude Code    | `.claude/agents/<name>.md`       | markdown + frontmatter |
| Cursor         | `.cursor/agents/<name>.md`       | markdown + frontmatter |
| OpenCode       | `.opencode/agents/<name>.md`     | markdown + frontmatter |
| GitHub Copilot | `.github/agents/<name>.agent.md` | markdown + frontmatter |
| Codex CLI      | `.codex/agents/<name>.toml`      | TOML (converted)       |
| Gemini CLI     | `.gemini/agents/<name>.md`       | markdown + frontmatter |

Agents are supported on all six tools.

## Frontmatter per tool

The canonical agent carries `name`, `description`, `model`. Emit those a row accepts, drop the rest. Optional fields (also listed) only if the user asked. Never invent a value.

| Tool           | Accepts                                                      |
| -------------- | ----------------------------------------------------------- |
| Claude Code    | `name`, `description`, `model`, optional `color`, `tools`   |
| Cursor         | `name`, `description`, `model`, optional `readonly`, `is_background` |
| OpenCode       | `name`, `description`, `model`, optional `temperature`, `permission` |
| GitHub Copilot | `name`, `description`, `model`, optional `tools`            |
| Codex CLI      | `name`, `description` (drops `model`)                       |
| Gemini CLI     | `name`, `description` only; its schema is strict and rejects any other key |

## Codex TOML conversion

Codex agents are TOML, not markdown. Convert:

- Each frontmatter field becomes a top-level TOML key. Quote every string value with `"double quotes"` (a TOML basic string) and escape any embedded `"` or backslash, so a quote or apostrophe in the description stays valid TOML.
- The body becomes `developer_instructions`, wrapped in `'''` literal delimiters (no escaping of the markdown).
- Drop `model`.

## Detect (which tools are installed)

| Signal                            | Tool(s)                               |
| --------------------------------- | ------------------------------------- |
| `.claude/` or `CLAUDE.md`         | Claude Code                           |
| `.cursor/`                        | Cursor                                |
| `.opencode/`                      | OpenCode                              |
| `.codex/`                         | Codex CLI                             |
| `.github/copilot-instructions.md` | GitHub Copilot                        |
| `.gemini/`                        | Gemini CLI                            |
| `AGENTS.md`                       | Cursor, OpenCode, or Codex (list all) |

## Write targets

- **Host project**: one file per confirmed tool, at the paths above.
- **Plugin source**: one canonical agent at `plugins/<plugin>/agents/<name>.md`. No per-tool fan-out.

The mode is chosen in the capture action. Never pick one silently.

## Safety checks

- **Asset-access precheck.** Before writing, confirm this reference is readable. If not, stop: the plugin is not installed in this host.
- **Write-target validation.** After writing, confirm every path is relative, under the workspace, and at the chosen scope. Otherwise stop and report the bad path.
