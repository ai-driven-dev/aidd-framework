# Tool paths (hooks)

Per-tool hook support, event names, file formats, and scopes. Hook slice only: nothing about skills, rules, agents, commands, plugins, or marketplaces.

Every claim marked `[v]` was read in the official documentation on **2026-08-11**; the pages are listed under [Sources](#sources). A claim marked `[?]` predates that pass and has not been re-read: treat it as unverified and confirm before wiring. Never replace a `[?]` with a guess.

## Per-tool support

| Tool           | Supported | Note                                                            |
| -------------- | --------- | --------------------------------------------------------------- |
| Claude Code    | yes       | JSON config + script. Richest event set. `[v]`                  |
| Codex CLI      | yes       | JSON/TOML config + script. Hooks are trust-gated. `[v]`         |
| Cursor         | yes       | JSON config + script. `[v]`                                     |
| GitHub Copilot | yes       | JSON config + script. Also reads Claude's `.claude/` config. `[v]` |
| OpenCode       | no        | Hooks are JS/TS plugin modules, not config. Skip with the reason below. `[v]` |

**OpenCode skip reason.** OpenCode hooks are code, not a config entry plus a script. The official config schema exposes no `hook` key; plugins are JS/TS modules under `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (user), per `https://opencode.ai/docs/plugins`. This skill does not generate them. Its documented events are `session.created`, `session.idle`, `session.compacted`, `session.updated`, `tool.execute.before`, `tool.execute.after`, `shell.env`, plus file, LSP, permission, message, and TUI events. There is **no session-end event**: `session.idle` is the only completion signal. A plugin's context is `{ project, client, $, directory, worktree }` and carries **no documented session identifier**; `sessionID` is documented only in the execution context of a custom tool. `tool.execute.before` can mutate `output.args.command` before a shell command runs. `[v]`

## Lifecycle moment to event name

Each tool names the same moment differently and supports a different subset. Core moments, with the canonical event name per tool. A `-` means the tool does not expose that moment.

| Moment             | Claude Code        | Codex CLI          | Cursor               | GitHub Copilot                       |
| ------------------ | ------------------ | ------------------ | -------------------- | ------------------------------------ |
| session start      | `SessionStart` `[v]` | `SessionStart` `[v]` | `sessionStart` `[v]` | `sessionStart` / `SessionStart` `[v]` |
| prompt submitted   | `UserPromptSubmit` `[v]` | `UserPromptSubmit` `[v]` | `beforeSubmitPrompt` `[v]` | `userPromptSubmitted` / `UserPromptSubmit` `[v]` |
| before a tool runs | `PreToolUse` `[v]` | `PreToolUse` `[v]` | `preToolUse` `[v]`   | `preToolUse` / `PreToolUse` `[v]`    |
| after a tool runs  | `PostToolUse` `[?]` | `PostToolUse` `[v]` | `postToolUse` `[v]`  | `postToolUse` / `PostToolUse` `[?]`  |
| before compaction  | `PreCompact` `[?]` | `PreCompact` `[v]` | `preCompact` `[v]`   | `[?]`                                |
| subagent start     | `SubagentStart` `[v]` | `SubagentStart` `[v]` | `subagentStart` `[v]` | `subagentStart` `[v]`               |
| subagent stop      | `SubagentStop` `[v]` | `SubagentStop` `[v]` | `subagentStop` `[v]` | `subagentStop` / `SubagentStop` `[v]` |
| turn stop          | `Stop` `[v]`       | `Stop` `[v]`       | `stop` `[v]`         | `agentStop` / `Stop` `[v]`           |
| session end        | `SessionEnd` `[v]` | `SessionEnd` `[v]` | `sessionEnd` `[v]`   | `sessionEnd` / `SessionEnd` `[v]`    |

Each tool exposes more moments than these. For the full list, read the tool's docs, linked under [Sources](#sources). Confirm a moment exists before wiring it.

**Copilot casing is not cosmetic.** The event name you configure selects the payload format: camelCase names deliver camelCase fields, PascalCase names deliver snake_case fields to match the VS Code Copilot extension. Some events also change name with the casing (`agentStop` becomes `Stop`, `userPromptSubmitted` becomes `UserPromptSubmit`). A handler written for one casing breaks on the other. `subagentStart` is documented without a PascalCase variant. Under a PascalCase `PreToolUse`, tool names are reported as Claude names (`Bash`, not `bash`). `[v]`

**Claude Code and Codex share these names but not their guarantees.** Read the per-tool rows below before assuming a shared payload.

## Session identifier in the payload

The field that identifies the conversation, when a hook needs to correlate its own records.

| Tool           | Field                                        | What the docs guarantee                                                                 |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Claude Code    | `session_id` `[v]`                           | Present in the common input fields. Subagent calls add `agent_id` and `agent_type`; the docs do **not** state that `session_id` is the parent's. |
| Codex CLI      | `session_id` `[v]`                           | "Subagent hooks use the parent session id" is stated explicitly.                         |
| Cursor         | `conversation_id` `[v]`                      | "Stable ID of the conversation across many turns". `sessionStart` and `sessionEnd` also carry `session_id`, documented as the same value. Subagents get their **own** id plus a separate `parent_conversation_id`. |
| GitHub Copilot | `sessionId` / `session_id` `[v]`             | Present in every event payload; the name follows the configured casing.                  |
| OpenCode       | none documented `[v]`                        | Plugin context carries no session id; `sessionID` appears only in custom-tool context.    |

**No tool documents what happens to this value across a resume, a clear, a compaction, or a fork.** All five expose a `source` or `reason` discriminant for those boundaries, but none states whether the identifier is kept or regenerated. Anything that depends on it must be measured, not assumed. `[v]`

**No tool documents that this value equals the session identifier in its telemetry export.** Claude Code documents such an equality for a different field only: its `prompt_id` "matches the `prompt.id` attribute on OpenTelemetry events" (requires Claude Code 2.1.196 or later). It is the only cross-surface join guaranteed by any of the five. `[v]`

## Shell command in the payload

For a hook that reacts to a command before it runs.

| Tool           | Event                    | Field                                        |
| -------------- | ------------------------ | -------------------------------------------- |
| Claude Code    | `PreToolUse`             | `tool_input.command` `[v]`                    |
| Codex CLI      | `PreToolUse`             | `tool_input.command`, for `Bash` and `apply_patch` `[v]` |
| Cursor         | `beforeShellExecution`   | `command`, at the top level `[v]`             |
| Cursor         | `preToolUse`             | `tool_input.command` `[v]`                    |
| GitHub Copilot | `preToolUse`             | nested in `toolArgs` / `tool_input`, typed `unknown`; the `command` key appears only in a how-to example, not in a normative table `[v]` |

## File and format per tool

| Tool           | File                                                              | Shape                                            |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Claude Code    | `settings.json`, plugin `hooks/hooks.json`, or component frontmatter | `{ "hooks": { "<Event>": [ { "matcher": "...", "hooks": [ { "type": "command", "command": "..." } ] } ] } }` |
| Codex CLI      | `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`, or `[hooks]` tables in either `config.toml` `[v]` | same entry shape as Claude; TOML uses `[[hooks.SessionStart]]` then `[[hooks.SessionStart.hooks]]` `[v]` |
| Cursor         | `.cursor/hooks.json`                                              | `{ "version": 1, "hooks": { "<event>": [ { "command": "..." } ] } }` |
| GitHub Copilot | `.github/hooks/*.json`, a `hooks` block in `.github/copilot/settings.json` or `.local.json`, `~/.copilot/hooks/`, plugin `hooks.json`, and policy files under `/etc/github-copilot/policy.d/*.json` `[v]` | `{ "version": 1, "hooks": { "<Event>": [ { "type": "command", "command": "..." } ] } }` |

A Claude `settings.json` and a plugin or standalone `hooks/hooks.json` both wrap the event map under a top-level `hooks` key, so the file is `{ "hooks": { "<Event>": [ ... ] } }`. A Codex `config.toml` uses a `[hooks]` table instead.

**Copilot reads Claude's files.** `.claude/settings.json` and `.claude/settings.local.json` in the repository are also read for inline hooks, so one Claude-format entry can cover both tools. Its cloud agent reads `.github/hooks/*.json` only. `[v]`

**All matching layers run.** On Codex, Cursor, and Copilot, entries from every layer are combined rather than overridden by precedence. Merging into one layer never disables another. `[v]`

## Scopes per tool

Ask the user which scope, then write the matching file. A `-` means the tool has no such scope.

| Scope            | Claude Code                    | Codex CLI                  | Cursor                       | GitHub Copilot           |
| ---------------- | ------------------------------ | -------------------------- | ---------------------------- | ------------------------ |
| user / global    | `~/.claude/settings.json`      | `~/.codex/` (`hooks.json` or `config.toml`) | `~/.cursor/hooks.json`       | `~/.copilot/hooks/`      |
| project, shared  | `.claude/settings.json`        | `<repo>/.codex/` (trust-gated) | `.cursor/hooks.json`         | `.github/hooks/`         |
| project, local   | `.claude/settings.local.json`  | -                          | -                            | -                        |
| component / agent | skill or agent frontmatter     | -                          | -                            | `.agent.md` frontmatter  |
| plugin           | plugin `hooks/hooks.json`      | plugin `hooks.json`        | -                            | plugin `hooks.json`      |
| enterprise / team | managed policy settings        | managed policy (`requirements.toml`) | team or enterprise path, and MDM paths | `policy.d/` or registry  |

Never pick a scope silently. State the resolved file and confirm it.

A component-scoped hook runs only while that component (the skill or agent) is active. A session-start or other always-on moment will not fire reliably from a component. Steer those to a project or user scope.

## Handler contract

The shared `command` handler: a script the tool runs at the moment. It reads the event JSON on stdin, then signals back.

- **Claude / Codex / Copilot.** Exit `0` is success (stdout may carry a JSON object or, on some moments, context). Exit `2` blocks on a moment that honors it (stderr surfaces to the model). Any other code is a non-blocking error.
- **Cursor.** Exit `0` success, exit `2` blocks (same as `permission: "deny"`), any other code fails open. Set `failClosed: true` on the entry to make a crash block instead. Gating moments return `{ "permission": "allow" | "deny" | "ask" }` on stdout.

Copilot also supports `type: "http"` handlers, which receive the same JSON as a POST body. `[v]`

## Failure semantics

The rule above is the shared shape. What a *failing* handler does differs per tool, and one of them denies the action.

| Tool           | Exit 2                                     | Other non-zero                                        | Timeout                                  |
| -------------- | ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| Claude Code    | blocks on moments that honor it `[v]`      | non-blocking; the action proceeds `[v]`               | `[?]`                                    |
| Codex CLI      | blocks `PreToolUse` and `UserPromptSubmit` `[v]` | `[?]`                                            | default 600 s; `SessionEnd` 1 s, max 3 s `[v]` |
| Cursor         | denies the action `[v]`                    | fails open unless `failClosed: true` `[v]`            | fails open unless `failClosed: true` `[v]` |
| GitHub Copilot | denies on `permissionRequest` and `preToolUse`, warning elsewhere `[v]` | fails open **except `preToolUse`, which fails closed** `[v]` | default 30 s, fails open on every event `[v]` |

**A hook that only observes must exit `0` unconditionally.** Wrap the whole body in a catch-all. On Copilot a crashing `preToolUse` handler denies the tool call, so an observer that throws stops the agent from working. `SessionStart` on Claude Code cannot block, but no other moment offers that guarantee. `[v]`

**A correctly installed hook can still be inert.** Codex requires a trust review before an unmanaged hook runs and can disable the feature wholesale with `[features] hooks = false`; Copilot has `disableAllHooks`. Check the state, not just the file. `[v]`

## Path placeholders in handlers

Written as `${VAR}` inside a command: `CLAUDE_PROJECT_DIR` (project root), `CLAUDE_PLUGIN_DATA` (plugin data dir), and the plugin install-directory variable (`CLAUDE_PLUGIN` + `_ROOT`). These are Claude tokens. For another tool, use an absolute path or the path the user names.

## Write targets

- **Host project.** Merge the entry into the resolved scope's file for each confirmed supported tool. The script goes in a `hooks/` dir beside the config by default, or another dir the user names, referenced by absolute path or an approved `${VAR}`.
- **Plugin source.** Merge into `plugins/<plugin>/hooks/hooks.json` (the bare hooks object), with the script under `plugins/<plugin>/hooks/scripts/`.

## Safety checks

- **Asset-access precheck.** Before writing, confirm this reference is readable. If not, stop: the plugin is not installed in this host.
- **Merge check.** Before writing, read the target file and confirm the new entry is appended to the moment's list, never overwriting a sibling.
- **Write-target validation.** After writing, confirm the file is valid and every handler path is an approved `${VAR}` or an absolute path under the workspace (a hook command runs from an arbitrary cwd, so an absolute path or `${VAR}` is expected, not a relative one). Otherwise stop and report.

## Sources

Read on 2026-08-11. Re-read before relying on a `[v]` claim older than a release cycle, and record the new date here.

| Tool           | Page                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| Claude Code    | `https://code.claude.com/docs/en/hooks`                                      |
| Claude Code    | `https://code.claude.com/docs/en/monitoring-usage`                           |
| Codex CLI      | `https://learn.chatgpt.com/docs/hooks`                                       |
| Codex CLI      | `https://learn.chatgpt.com/docs/config-file/config-advanced`                 |
| Cursor         | `https://cursor.com/docs/hooks`                                              |
| GitHub Copilot | `https://docs.github.com/en/copilot/reference/hooks-reference`               |
| GitHub Copilot | `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks` |
| OpenCode       | `https://opencode.ai/docs/plugins`                                           |
| OpenCode       | `https://opencode.ai/config.json`                                            |

Two URLs moved and now redirect. `https://developers.openai.com/codex/hooks` redirects to the Codex page above; `https://docs.github.com/en/copilot/reference/hooks-configuration` redirects to the Copilot reference above. Follow the redirect and cite the target.
