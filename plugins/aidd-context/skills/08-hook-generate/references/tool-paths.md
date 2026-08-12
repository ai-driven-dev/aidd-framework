# Tool paths (hooks)

Per-tool hook support, event names, file formats, and scopes. Hook slice only: nothing about skills, rules, agents, commands, plugins, or marketplaces.

## Per-tool support

| Tool           | Supported | Note                                                            |
| -------------- | --------- | --------------------------------------------------------------- |
| Claude Code    | yes       | JSON config + script. Richest event set.                        |
| Codex CLI      | yes       | JSON/TOML config + script. Hooks are stable, on by default.      |
| Cursor         | yes       | JSON config + script.                                           |
| GitHub Copilot | yes       | JSON config + script. Also reads Claude's `.claude/` config.    |
| OpenCode       | no        | Hooks are JS/TS plugin modules, not config. Skip with the reason below. |
| Gemini CLI     | yes       | JSON config + script, in `.gemini/settings.json`. Its own event names, see below. |

**OpenCode skip reason.** OpenCode hooks are code, not a config entry plus a script. Point the user to write a plugin under `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (user), per `https://opencode.ai/docs/plugins`. This skill does not generate it.

## Lifecycle moment to event name

Each tool names the same moment differently and supports a different subset. Core moments, with the canonical event name per tool. A `-` means the tool does not expose that moment.

| Moment             | Claude Code        | Codex CLI       | Cursor               | GitHub Copilot     | Gemini CLI      |
| ------------------ | ------------------ | --------------- | -------------------- | ------------------ | --------------- |
| session start      | `SessionStart`     | `SessionStart`  | `sessionStart`       | `SessionStart`     | `SessionStart`  |
| prompt submitted   | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` | `UserPromptSubmit` | `BeforeAgent`   |
| before a tool runs | `PreToolUse`       | `PreToolUse`    | `preToolUse`         | `PreToolUse`       | `BeforeTool`    |
| after a tool runs  | `PostToolUse`      | `PostToolUse`   | `postToolUse`        | `PostToolUse`      | `AfterTool`     |
| before compaction  | `PreCompact`       | `PreCompact`    | `preCompact`         | `PreCompact`       | `PreCompress`   |
| subagent stop      | `SubagentStop`     | `SubagentStop`  | `subagentStop`       | `SubagentStop`     | `AfterAgent`    |
| turn stop          | `Stop`             | `Stop`          | `stop`               | `Stop`             | `AfterAgent`    |
| session end        | `SessionEnd`       | -               | `sessionEnd`         | `SessionEnd`       | `SessionEnd`    |

Gemini folds turn stop and subagent stop onto one event, so two Claude moments map to `AfterAgent`. Its names come from the mapping table shipped in `gemini hooks migrate`, read out of the 0.52.0 bundle, not from prose documentation.

Each tool exposes more moments than these. For the full list, read the tool's docs: Claude `https://code.claude.com/docs/en/hooks`, Codex `https://developers.openai.com/codex/hooks`, Cursor `https://cursor.com/docs/hooks`, Copilot `https://docs.github.com/en/copilot/reference/hooks-configuration`. Confirm a moment exists before wiring it. Copilot also accepts the camelCase names (`sessionStart`, `preToolUse`).

## File and format per tool

| Tool           | File                                                              | Shape                                            |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Claude Code    | `settings.json`, plugin `hooks/hooks.json`, or component frontmatter | `{ "hooks": { "<Event>": [ { "matcher": "...", "hooks": [ { "type": "command", "command": "..." } ] } ] } }` |
| Codex CLI      | `~/.codex/hooks.json` or `[hooks]` in `config.toml`              | same entry shape as Claude.                       |
| Cursor         | `.cursor/hooks.json`                                              | `{ "version": 1, "hooks": { "<event>": [ { "command": "..." } ] } }` |
| GitHub Copilot | `.github/hooks/*.json` or a `hooks` block in `.github/copilot/settings.json` | `{ "version": 1, "hooks": { "<Event>": [ { "type": "command", "command": "..." } ] } }` |
| Gemini CLI     | `hooks` block in `.gemini/settings.json`                          | same entry shape as Claude, under Gemini's own event names. |

A Claude `settings.json` and a plugin or standalone `hooks/hooks.json` both wrap the event map under a top-level `hooks` key, so the file is `{ "hooks": { "<Event>": [ ... ] } }`. A Codex `config.toml` uses a `[hooks]` table instead.

## Scopes per tool

Ask the user which scope, then write the matching file. A `-` means the tool has no such scope.

| Scope            | Claude Code                    | Codex CLI                  | Cursor                       | GitHub Copilot           | Gemini CLI                    |
| ---------------- | ------------------------------ | -------------------------- | ---------------------------- | ------------------------ | ----------------------------- |
| user / global    | `~/.claude/settings.json`      | `~/.codex/` (`hooks.json` or `config.toml`) | `~/.cursor/hooks.json`       | `~/.copilot/hooks/`      | `~/.gemini/settings.json`     |
| project, shared  | `.claude/settings.json`        | `<repo>/.codex/` (trust-gated) | `.cursor/hooks.json`         | `.github/hooks/`         | `.gemini/settings.json` (trust-gated) |
| project, local   | `.claude/settings.local.json`  | -                          | -                            | -                        | -                             |
| component / agent | skill or agent frontmatter     | -                          | -                            | `.agent.md` frontmatter  | -                             |
| plugin           | plugin `hooks/hooks.json`      | plugin `hooks.json`        | -                            | -                        | -                             |
| enterprise / team | managed policy settings        | managed policy             | team or enterprise path      | `policy.d/` or registry  | -                             |

Gemini disables project hooks entirely in an untrusted folder, printing `Project hooks disabled because the folder is not trusted`. Trust the folder, or the project scope silently does nothing.

Never pick a scope silently. State the resolved file and confirm it.

A component-scoped hook runs only while that component (the skill or agent) is active. A session-start or other always-on moment will not fire reliably from a component. Steer those to a project or user scope.

## Handler contract

The shared `command` handler: a script the tool runs at the moment. It reads the event JSON on stdin, then signals back.

- **Claude / Codex / Copilot.** Exit `0` is success (stdout may carry a JSON object or, on some moments, context). Exit `2` blocks on a moment that honors it (stderr surfaces to the model). Any other code is a non-blocking error.
- **Cursor.** Exit `0` success, exit `2` blocks (same as `permission: "deny"`), any other code fails open. Set `failClosed: true` on the entry to make a crash block instead. Gating moments return `{ "permission": "allow" | "deny" | "ask" }` on stdout.

Per-tool stdout schemas and which moments can block live in each tool's docs (linked above). Codex also has a `notify` mechanism (user scope only, single turn-complete event, JSON on argv not stdin) for a simple turn-complete notification.

## Path placeholders in handlers

Written as `${VAR}` inside a command: `CLAUDE_PROJECT_DIR` (project root), `CLAUDE_PLUGIN_DATA` (plugin data dir), and the plugin install-directory variable (`CLAUDE_PLUGIN` + `_ROOT`). These are Claude tokens. For another tool, use an absolute path or the path the user names.

## Write targets

- **Host project.** Merge the entry into the resolved scope's file for each confirmed supported tool. The script goes in a `hooks/` dir beside the config by default, or another dir the user names, referenced by absolute path or an approved `${VAR}`.
- **Plugin source.** Merge into `plugins/<plugin>/hooks/hooks.json` (the bare hooks object), with the script under `plugins/<plugin>/hooks/scripts/`.

## Safety checks

- **Asset-access precheck.** Before writing, confirm this reference is readable. If not, stop: the plugin is not installed in this host.
- **Merge check.** Before writing, read the target file and confirm the new entry is appended to the moment's list, never overwriting a sibling.
- **Write-target validation.** After writing, confirm the file is valid and every handler path is an approved `${VAR}` or an absolute path under the workspace (a hook command runs from an arbitrary cwd, so an absolute path or `${VAR}` is expected, not a relative one). Otherwise stop and report.
