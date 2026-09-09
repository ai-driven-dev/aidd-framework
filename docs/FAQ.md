# ❓ FAQ & Troubleshooting

Most "how do I…" answers live in the README; this page covers what isn't documented elsewhere, plus common install issues and the framework's limits.

## 🤔 Why AIDD instead of your own skills?

You can write your own Claude Code skills — nothing stops you. AIDD exists because that setup is work every team repeats and re-debugs alone: the router/action split ([Skill](GLOSSARY.md#-skill) glossary entry), the plan → implement → review gating, the plugin packaging and versioning, the multi-tool support (Cursor, Copilot, Codex, OpenCode). AIDD ships that scaffolding pre-built and maintained, so you start from a working SDLC loop and only author the skill content specific to your project. If your workflow doesn't match the framework's shape, [`CREATE_PLUGIN.md`](CREATE_PLUGIN.md) shows how to build on the same scaffolding instead of replacing it.

## 📦 Install, update, other tools

- **Install / first run** → [Quick start](../README.md#-quick-start).
- **Update plugins** → `/plugin marketplace update aidd-framework`, or see [Versioning & updates](MARKETPLACE.md#-versioning--updates).
- **Private repo?** Yes — `/plugin marketplace add` just needs GitHub read access (via `gh auth login` or a PAT).
- **Cursor / Copilot / Codex / OpenCode?** Each other tool installs via its own native mechanism (project files, local plugins, or a plugin command) from the [release](https://github.com/ai-driven-dev/framework/releases/latest) archives. Steps per tool → [Other tools](../README.md#other-tools).

## 💸 Cost and quotas

- **Does running plugins cost money?** The plugins are MIT-licensed and free; the Claude calls they make consume your Anthropic plan or API balance (per-invocation on a plan, per-token on an API key).
- **Disable a plugin without uninstalling?** Run `/plugin` and toggle it off in the **Installed** tab, or remove its entry from `.claude/settings.json` `enabledPlugins` (project scope) or `~/.claude/plugins/` (user scope).

## 🔒 Security

- **What can a plugin do? Is it safe?** → [Trust and safety](../README.md#-trust-and-safety) and [`SECURITY.md`](../SECURITY.md). Plugins run commands, edit files, and call services through your AI tool — inspect a plugin's `actions/`, `hooks/hooks.json`, and `.mcp.json` before installing. Claude Code asks before tool calls by default.
- **Report a vulnerability** → [`SECURITY.md`](../SECURITY.md) (GitHub Security Advisories; never a public issue).

## 🤝 Contributing

- **Write your own plugin** → [`CREATE_PLUGIN.md`](CREATE_PLUGIN.md).
- **File a bug / request a feature** → [issue templates](https://github.com/ai-driven-dev/framework/issues/new/choose).
- **Community** → [Discord](https://discord.gg/EWySJSpjWs) · [website](https://www.ai-driven-dev.fr/) (more in the [README](../README.md#-the-ai-driven-dev)).

## 🛠️ Troubleshooting

- **Marketplace doesn't show my plugins after `/plugin marketplace add`** — refresh the cache: `/plugin marketplace update aidd-framework`, then open `/plugin` → **Discover**.
- **`/plugin install` says the plugin is unknown** — the marketplace name must match the `name` in this repo's `.claude-plugin/marketplace.json` (`aidd-framework`). Install with `/plugin install <plugin-name>@aidd-framework`.
- **A private repo won't add as a marketplace** — `/plugin marketplace add` needs read access; authenticate with `gh auth login` or a PAT on the machine running your AI tool.
- **My new plugin's actions don't load** — run `/reload-plugins` in the same session, or restart the tool if a hook config changed.

## 🚧 Limitations (what AIDD does not do)

- **Not autonomous by default.** Skills run under human supervision; you drive each step.
- **Authored for Claude Code.** Other tools install via their native mechanism from the release archives ([Other tools](../README.md#other-tools)); public-marketplace publishing is on the way, native parity is a roadmap item.
- **Plugins assume their own context.** A skill that expects a git repo, a `package.json`, or a ticketing tool won't work without it — check the plugin's README.
- **No hosted service.** AIDD is prompt content you install into your own tool; there is no AIDD server and no account.
- **Measurement is off unless you turn it on.** It records nothing until you do, and nothing leaves your machine → [Measurement](#-measurement).

## 📊 Measurement

**The switch is git-tracked, so it applies to everyone who clones; opt out per person with `AIDD_TELEMETRY=0`. Nothing leaves your machine.**

The `aidd-telemetry` plugin is not part of the curated install, and even installed it records
nothing until you allow it. Ask your AI tool for the plugin's `00-init` skill: it turns
measurement on for the current project and tells you what is now recorded.

Then work as usual, and ask `01-cost` what a period or a task consumed. No account, no
server — but turning it on and asking both need the `aidd` CLI
(`npm install -g @ai-driven-dev/cli`); recording itself, in between, needs nothing
installed.

| Where | What |
| --- | --- |
| `aidd_docs/runs/` in your repository, git-ignored | which session served which task, which skill was running when, and which files inside a task folder changed |
| `~/.config/aidd/telemetry/` | token counts and model names, read out of the transcript your AI tool already wrote |

**No prompt, no code, no diff** — the stored shape is an allowlist, field by field, in
[`metrics-contract.md`](../aidd_docs/product/metrics-contract.md).

Turning it off stops the recording and keeps what you already measured. `aidd telemetry off`
removes the switch and the commit trailer, `aidd telemetry forget` the records; both
directories, and the `.aidd/config.json` that opted you in, are ordinary files you can delete. Coverage differs per AI tool, and a tool that cannot be
measured is named rather than shown as a zero →
[the plugin's README](../plugins/aidd-telemetry/README.md).

## 🆘 Still stuck?

Ask in [Discussions](https://github.com/ai-driven-dev/framework/discussions) or on [Discord](https://discord.gg/EWySJSpjWs). For a bug, open an [issue](https://github.com/ai-driven-dev/framework/issues/new/choose). See [`SUPPORT.md`](../.github/SUPPORT.md).
