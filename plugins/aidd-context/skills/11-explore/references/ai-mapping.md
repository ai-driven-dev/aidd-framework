# AI mapping (explore scan paths)

Where to look for each artifact type per AI tool. Scan-only: the paths and formats the survey and drill actions read. This is explore's own minimal map, the single source of per-tool surfaces. Actions never hardcode a tool.

## Presence signal

A tool is present only when one of its own mapped surfaces below holds a file. A shared parent directory is never a signal by itself.

## AI quick map - content artifacts

| AI             | Agents                      | Commands / Prompts                            | Rules                                    | Skills                                | Context file                      |
| -------------- | --------------------------- | --------------------------------------------- | ---------------------------------------- | ------------------------------------- | --------------------------------- |
| Claude Code    | `.claude/agents/`           | `.claude/commands/`                           | `.claude/rules/`                         | `.claude/skills/`                     | `CLAUDE.md`                       |
| Cursor         | `.cursor/agents/`           | `.cursor/commands/`                           | `.cursor/rules/`                         | `.cursor/skills/`                     | `AGENTS.md`                       |
| OpenCode       | `.opencode/agents/`         | `.opencode/commands/`                         | **Not supported** (fold into AGENTS.md)  | `.opencode/skills/`                   | `AGENTS.md`                       |
| GitHub Copilot | `.github/agents/*.agent.md` | `.github/prompts/*.prompt.md`                 | `.github/instructions/*.instructions.md` | `.github/skills/`                     | `.github/copilot-instructions.md` |
| Codex CLI      | `.codex/agents/{name}.toml` | **Not supported**                             | Not supported                            | `.agents/skills/aidd-{name}/SKILL.md` | `AGENTS.md`                       |
| Gemini CLI     | `.gemini/agents/{name}.md`  | **Not supported**                             | Not supported                            | `.agents/skills/aidd-{name}/SKILL.md` | `AGENTS.md` (via `context.fileName`) |

## AI quick map - hooks, plugins

| AI             | Hooks                                                                                          | Plugin manifest              |
| -------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| Claude Code    | `.claude/settings.json` `hooks` key OR `<plugin>/hooks/hooks.json` OR inline in skill/agent header | `.claude-plugin/plugin.json` |
| Cursor         | `.cursor/hooks.json` (project), `~/.cursor/hooks.json` (user), `<plugin>/hooks/hooks.json` (plugin) | `.cursor-plugin/plugin.json` |
| OpenCode       | JS/TS module under `.opencode/plugins/` (parse as JS, not JSON)                                | Not supported                |
| GitHub Copilot | `.github/hooks/*.json` (workspace), `~/.copilot/hooks` (user), `<plugin>/hooks.json` or `<plugin>/hooks/hooks.json` (plugin) | `plugin.json` at plugin root |
| Codex CLI      | `.codex/hooks.json` (project / user) OR `[hooks]` table in `.codex/config.toml`               | `.codex-plugin/plugin.json`  |
| Gemini CLI     | `hooks` key in `.gemini/settings.json`, under Gemini's own event names                        | Not supported                |

## MCP config per tool

| Tool           | MCP config file                                  | Servers key   |
| -------------- | ------------------------------------------------ | ------------- |
| Claude Code    | `.mcp.json` (project root)                       | `mcpServers`  |
| Cursor         | `.cursor/mcp.json`                               | `mcpServers`  |
| OpenCode       | `opencode.json`                                  | `mcp`         |
| GitHub Copilot | `.vscode/mcp.json` (VS Code); `~/.copilot/mcp-config.json` (CLI) | `servers` (VS Code); `mcpServers` (CLI) |
| Codex CLI      | `.codex/config.toml`                             | `[mcp_servers.*]` |
| Gemini CLI     | `.gemini/settings.json`                          | `mcpServers`  |

## Path layout per tool

Rules and commands follow a two-layout scheme. Subdir-tools organize files under named category or phase subdirectories; flat-tools (GitHub Copilot) write all files directly into the surface root with a category or phase index as a filename prefix.

| Layout          | Surface   | Tools                                    | Example                                                        |
| --------------- | --------- | ---------------------------------------- | -------------------------------------------------------------- |
| Subdir          | Rules     | Claude Code, Cursor                      | `<rules root>/02-programming-languages/2-typescript-naming.md` |
| Subdir          | Commands  | Claude Code, Cursor, OpenCode            | `<commands root>/10_maintenance/fix-issue.md`                  |
| Flat            | Both      | GitHub Copilot                           | `.github/instructions/02-typescript-naming.instructions.md`    |

## Plugin install locations per tool

Where to scan when enumerating installed plugins (not the plugin manifest path inside the plugin tree).

| Tool | Install location(s) |
| ---- | ------------------- |
| Claude Code    | `~/.claude/plugins/cache/` (marketplace-installed); project-local `.claude-plugin/` for plugins committed to the repo |
| Cursor         | `~/.cursor/plugins/local/<plugin>` (local symlink); marketplace install path (managed by Cursor) |
| OpenCode       | `~/.config/opencode/plugins/` (global JS/TS modules); `~/.cache/opencode/node_modules/` (npm-installed); project `.opencode/plugins/` |
| GitHub Copilot | macOS: `~/Library/Application Support/Code/agentPlugins/` ; Linux: `~/.config/Code/agentPlugins/` ; Windows: `%APPDATA%\Code\agentPlugins\` ; CLI-installed: `~/.copilot/installed-plugins/` |
| Codex CLI      | `~/.codex/plugins/cache/$MARKETPLACE/$PLUGIN/$VERSION/` |
| Gemini CLI     | No plugin manager. Content is materialized as files in the project, never registered. |
