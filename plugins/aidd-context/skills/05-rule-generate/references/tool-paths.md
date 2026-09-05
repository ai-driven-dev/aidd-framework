# Tool paths (rules)

The per-tool rules path and write targets. Rule slice only, nothing about skills, agents, commands, hooks, plugins, or marketplaces.

## Rules path per tool

| Tool           | Path                                               | Supported  |
| -------------- | -------------------------------------------------- | ---------- |
| Claude Code    | `.claude/rules/<category>/<slug>.md`               | yes        |
| Cursor         | `.cursor/rules/<category>/<slug>.mdc`              | yes        |
| GitHub Copilot | `.github/instructions/<NN>-<name>.instructions.md` | yes (flat) |
| OpenCode       | `.opencode/rules/<category>/<slug>.md`              | yes        |
| Codex CLI      | `.codex/rules/<category>/<slug>.md`                 | yes        |

`<slug>` is the file name `#-slug` from `rule-authoring.md` (e.g. `2-python-fstrings`). `<name>` is that slug with its leading category digit dropped (`python-fstrings`). `<category>` is the folder `<NN>-<name-of-category>`, the zero-padded category index plus the category name from the taxonomy, e.g. `01-standards`. `<NN>` is that same two-digit index.

Copilot is flat: no category folder. Its file is `<NN>-<name>`, e.g. `2-python-fstrings` becomes `02-python-fstrings` (one category prefix, no folder).

Every tool above installs rules. This table used to say OpenCode and Codex do not, and to tell a generator to put the convention in AGENTS.md instead; both were false. `plugin-content-translator.ts` routes a plugin's `rules/` into every tool whose capability accepts them, and all five accept them — `aidd ai rules` prints where each one lands, asked of the installer itself rather than of a list.

Both use the same frontmatter as Claude Code: `paths` (array of globs), omitted for an all-files rule.

## Scope frontmatter per tool

The file-scope field is named differently per tool. Set the right one.

| Tool           | Fields                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Claude Code    | `paths` (array of globs). Omit `paths` for an all-files rule; no `paths` means it applies everywhere.  |
| Cursor         | `description` (one line, what the rule governs), `globs` (comma-separated; omit for all-files), `alwaysApply` (false; true for all-files). |
| GitHub Copilot | `applyTo` (single glob string; `**` for an all-files rule).                                          |

A multi-glob `paths` becomes a comma-joined string for Cursor and Copilot, or the most-encompassing glob.

## Detect (which tools are installed)

| Signal                            | Tool(s)        |
| --------------------------------- | -------------- |
| `.claude/` or `CLAUDE.md`         | Claude Code    |
| `.cursor/`                        | Cursor         |
| `.github/copilot-instructions.md` | GitHub Copilot |

## Write targets

- **Host project**: one file per supported confirmed tool, at the paths above.
- **Plugin source**: one canonical `.md` rule under `plugins/<plugin>/rules/<category>/<slug>.md`. No per-tool fan-out. Carry a `paths` array for a scoped rule, or no frontmatter block for all-files. Per-tool frontmatter is reconciled at install.

The mode is chosen in the capture action. Never pick one silently.

## Safety checks

- **Asset-access precheck**: before writing, confirm this reference is readable. If not, stop: the plugin is not installed in this host.
- **Write-target validation**: after writing, confirm every path is relative, under the workspace, and at the chosen scope. Otherwise stop and report the bad path.
