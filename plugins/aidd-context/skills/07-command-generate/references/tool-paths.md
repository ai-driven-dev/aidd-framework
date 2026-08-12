# Tool paths (commands)

The per-tool command path and write targets. Command slice only, nothing about skills, rules, agents, hooks, plugins, or marketplaces.

## Command path per tool

| Tool           | Path                                        | Supported                            |
| -------------- | ------------------------------------------- | ------------------------------------ |
| Claude Code    | `.claude/commands/<location>/<slug>.md`   | yes                                  |
| Cursor         | `.cursor/commands/<location>/<slug>.md`   | yes (plain markdown, no frontmatter) |
| OpenCode       | `.opencode/commands/<location>/<slug>.md` | yes                                  |
| GitHub Copilot | `.github/prompts/<slug>.prompt.md`        | yes (flat)                           |
| Codex CLI      | -                                         | no                                   |
| Gemini CLI     | -                                         | no                                   |

`<location>` is whatever the user chose: a flat folder, a namespace, or an opt-in `<NN>_<phase>/` from the taxonomy. Copilot is flat: no subfolder, so fold any location prefix into the filename.

- **Codex CLI**: no custom slash commands, only built-ins. Skip it. Suggest a skill if a reusable workflow is needed.
- **Gemini CLI**: same. Skip it and suggest a skill, which Gemini does discover.

## Frontmatter per tool

Drop a field a tool does not support. Never invent a substitute.

| Tool           | Frontmatter                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| Claude Code    | `description`, `argument-hint`, `model`, `allowed-tools`, `disable-model-invocation` |
| Cursor         | none (plain markdown), input via `$ARGUMENTS`                                         |
| OpenCode       | `description`, input via `$ARGUMENTS` or `$1`, `$2`                                   |
| GitHub Copilot | `description`, `applyTo` (no `model`)                                                 |

## Detect (which tools are installed)

| Signal                            | Tool(s)        |
| --------------------------------- | -------------- |
| `.claude/` or `CLAUDE.md`         | Claude Code    |
| `.cursor/`                        | Cursor         |
| `.opencode/`                      | OpenCode       |
| `.github/copilot-instructions.md` | GitHub Copilot |

## Write targets

- **Host project**: one file per supported confirmed tool, at the paths above.
- **Plugin source**: one canonical `.md` command under `plugins/<plugin>/commands/<location>/<slug>.md`, same chosen location as host mode. No per-tool fan-out. Carry the full Claude field set as the canonical frontmatter. Per-tool reconciliation happens at install.

The mode is chosen in the capture action. Never pick one silently.

## Safety checks

- **Asset-access precheck**: before writing, confirm this reference is readable. If not, stop: the plugin is not installed in this host.
- **Write-target validation**: after writing, confirm every path is relative, under the workspace, and at the chosen location. Otherwise stop and report the bad path.
