# Token optimization techniques

Cut token usage across coding agents with client-specific commands and measurable checks.

- [Token optimization techniques](#token-optimization-techniques)
  - [Steps to cut token usage](#steps-to-cut-token-usage)
    - [🟢 Beginner](#-beginner)
      - [1) 📏 Measure session usage](#1--measure-session-usage)
      - [2) 📟 Keep usage visible](#2--keep-usage-visible)
      - [3) 📊 Analyze local history](#3--analyze-local-history)
      - [4) 🔎 Inspect Claude's loaded context](#4--inspect-claudes-loaded-context)
      - [5) ✂️ Keep AGENTS.md and CLAUDE.md short](#5-️-keep-agentsmd-and-claudemd-short)
      - [6) 🎯 Scope rules to matching files](#6--scope-rules-to-matching-files)
      - [7) 🧩 Load skills only on demand](#7--load-skills-only-on-demand)
      - [8) 🧠 Disable stale auto-memory](#8--disable-stale-auto-memory)
      - [9) 🪨 Compress instruction files with Caveman](#9--compress-instruction-files-with-caveman)
      - [10) 🧭 Plan before expensive work](#10--plan-before-expensive-work)
      - [11) ♻️ Reset unrelated work](#11-️-reset-unrelated-work)
      - [12) 🗜️ Compact the same task](#12-️-compact-the-same-task)
    - [🟡 Intermediate](#-intermediate)
      - [13) 📈 Export token telemetry](#13--export-token-telemetry)
      - [14) 🗣️ Set native concise output](#14-️-set-native-concise-output)
      - [15) 🪨 Compress output with Caveman](#15--compress-output-with-caveman)
      - [16) 🧠 Shape actionable output with i-have-adhd](#16--shape-actionable-output-with-i-have-adhd)
      - [17) 🧹 Filter shell output with RTK](#17--filter-shell-output-with-rtk)
      - [18) ✂️ Filter shell output with SNIP](#18-️-filter-shell-output-with-snip)
      - [19) 🪝 Automate RTK where supported](#19--automate-rtk-where-supported)
      - [20) ✋ Cap Codex tool history](#20--cap-codex-tool-history)
      - [21) 🚫 Block bulky paths](#21--block-bulky-paths)
      - [22) 🔌 Limit MCP exposure](#22--limit-mcp-exposure)
    - [🔴 Expert](#-expert)
      - [23) 🔬 Inspect model-visible behavior](#23--inspect-model-visible-behavior)
      - [24) 🎯 Route model and effort by difficulty](#24--route-model-and-effort-by-difficulty)
      - [25) 🧫 Isolate noisy work with subagents](#25--isolate-noisy-work-with-subagents)
      - [26) 🧊 Preserve Claude prompt-cache prefixes](#26--preserve-claude-prompt-cache-prefixes)
      - [27) ✅ Lower reasoning on routine work](#27--lower-reasoning-on-routine-work)
  - [Verify the result](#verify-the-result)
<!-- Sources checked: 2026-08-07. -->

## Steps to cut token usage

### 🟢 Beginner

#### 1) 📏 Measure session usage

Measure equivalent tasks end to end: input comes from instructions, history, tools, and logs; output comes from verbosity and reasoning; optimizers and subagents can be net-negative.

| Client | Command | Measures |
| --- | --- | --- |
| Claude Code | `/usage` (`/cost`, `/stats`) | Session tokens, estimated cost, and supported attribution |
| Codex | `/status`; `/usage daily`, `/usage weekly`, `/usage cumulative` | Current context and account token activity |

See [Claude Code costs](https://code.claude.com/docs/en/costs) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

#### 2) 📟 Keep usage visible

Use the native status line instead of asking the model for usage.

```text
Claude Code: /statusline
Codex:       /statusline
```

Rollback: run Claude Code `/statusline clear`; remove Codex `tui.status_line` from `config.toml` to restore its default.

![Claude Code status line showing context-window usage](https://mintcdn.com/claude-code/nibzesLaJVh4ydOq/images/statusline-context-window-usage.png?fit=max&auto=format&n=nibzesLaJVh4ydOq&q=85&s=15b58ab3602f036939145dde3165c6f7)

See [Claude Code status lines](https://code.claude.com/docs/en/statusline).

#### 3) 📊 Analyze local history

Use local logs when one session counter is insufficient.

| Need | Tool | Command |
| --- | --- | --- |
| Aggregate supported coding agents | [`ccusage`](https://github.com/ccusage/ccusage) | `npx ccusage@latest` |
| Inspect individual Claude Code prompts | [`prompt-analytics-for-claude-code`](https://github.com/romainfjgaspard/prompt-analytics-for-claude-code) | `uvx --from prompt-analytics-for-claude-code prompt-analytics summary` |

Local logs can contain prompt text. Treat exports as sensitive.

![Prompt Analytics dashboard](https://raw.githubusercontent.com/romainfjgaspard/prompt-analytics-for-claude-code/main/docs/screenshots/dashboard-home.png)

#### 4) 🔎 Inspect Claude's loaded context

Target the largest source shown by Claude Code.

```text
/context all
/memory
```

#### 5) ✂️ Keep AGENTS.md and CLAUDE.md short

Keep durable constraints and validation commands while removing architecture prose, task notes, and duplicated instructions.

| Client | Persistent file |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.override.md` when present, otherwise `AGENTS.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |

```md
# Persistent instructions

- Lead with the result.
- Preserve unrelated changes.
- Run the smallest relevant validation.
- Quote only the decisive error line.
```

See the local [AGENTS.md template](../../../02-project-memory/assets/templates/AGENTS.md), [Claude Code memory](https://code.claude.com/docs/en/memory), and [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

#### 6) 🎯 Scope rules to matching files

Move file-specific guidance out of the root instruction file.

Claude Code `.claude/rules/api.md`:

```md
---
paths:
  - "src/api/**/*.ts"
---

- Validate every API input.
- Use the standard error response.
```

Codex `src/api/AGENTS.md`:

```md
# API rules

- Validate every API input.
- Use the standard error response.
```

#### 7) 🧩 Load skills only on demand

Hide manual Claude skills and disable unused Codex skills.

Claude Code skill frontmatter:

```yaml
---
name: deploy
description: Deploy the application
disable-model-invocation: true
---
```

Remove `disable-model-invocation` or set it to `false` to restore automatic Claude invocation.

Codex `config.toml`:

```toml
[[skills.config]]
path = "/absolute/path/to/skill"
enabled = false
```

Set `enabled = true` to restore the Codex skill. An invoked skill stays in the session context, so keep its body short.

#### 8) 🧠 Disable stale auto-memory

Disable memory only when repeated rediscovery costs less than loading it.

Claude Code `.claude/settings.local.json`:

```json
{
  "autoMemoryEnabled": false
}
```

Codex `config.toml` when experimental Memories are enabled:

```toml
[memories]
use_memories = false
generate_memories = false
```

Set the flags back to `true` to restore memory generation and use. Inspect first with Claude Code `/memory` or Codex `/memories`.

#### 9) 🪨 Compress instruction files with Caveman

Run `caveman-compress`, inspect the diff, then restore any weakened constraint.

```bash
# Claude Code
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
# Invoke: /caveman-compress CLAUDE.md

# Codex
npx skills add JuliusBrussee/caveman -a codex
# Invoke: $caveman-compress AGENTS.md
```

See [Caveman's install matrix](https://github.com/JuliusBrussee/caveman/blob/main/INSTALL.md) and [compression documentation](https://github.com/JuliusBrussee/caveman/blob/main/README.md#what-you-get).

Rollback the edited instruction file from version control if compression weakens a constraint.

#### 10) 🧭 Plan before expensive work

Plan only when a wrong implementation would cost more than the planning turn.

| Client | Command |
| --- | --- |
| Claude Code | `/plan`, or `claude --permission-mode plan` |
| Codex | `/plan` |

```text
/plan Propose the smallest implementation and its validation before editing
```

See [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) and [Codex best practices](https://learn.chatgpt.com/guides/best-practices).

#### 11) ♻️ Reset unrelated work

Start a fresh context when the goal changes.

| Situation | Claude Code | Codex |
| --- | --- | --- |
| New task | `/clear` | `/new` |
| Abandon a wrong branch | `/rewind` | Start or fork a chat |
| Disposable aside | `/btw` | `/side` or `/btw` |

#### 12) 🗜️ Compact the same task

Keep the goal, decisions, failing evidence, and next validation.

```text
Claude Code: /compact keep the repro and failing test; drop file dumps
Codex:       /compact
```

See [Claude Code commands](https://code.claude.com/docs/en/commands) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

### 🟡 Intermediate

#### 13) 📈 Export token telemetry

Export structured metrics without prompt or tool content.

Claude Code:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_METRICS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics \
OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/protobuf \
claude
```

Codex `config.toml`:

```toml
[otel]
environment = "dev"
log_user_prompt = false
exporter = { otlp-http = { endpoint = "http://localhost:4318/v1/logs", protocol = "binary" } }
```

See [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage) and [Codex observability](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry).

Remove the telemetry environment variables or the `[otel]` table to stop exporting.

#### 14) 🗣️ Set native concise output

Preserve code, errors, evidence, and security warnings while removing filler.

Claude Code `.claude/output-styles/concise-coding.md`:

```md
---
name: Concise coding
description: Short, evidence-preserving coding responses
keep-coding-instructions: true
---

Answer directly. Preserve code, decisive errors, evidence, and security warnings; omit filler.
```

Codex `config.toml`:

```toml
model_verbosity = "low"
model_reasoning_summary = "concise"
```

`model_reasoning_summary` changes the reasoning summary, not the final answer. See [Claude Code output styles](https://code.claude.com/docs/en/output-styles) and [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

Select Claude Code's built-in default style or delete the custom file; remove the two Codex keys to restore defaults.

#### 15) 🪨 Compress output with Caveman

Use `lite` first because stronger modes trade readability for fewer output tokens.

Install Caveman with [step 9](#9--compress-instruction-files-with-caveman), then invoke its output mode:

```text
Claude Code: /caveman lite
Codex:       $caveman lite
```

```text
Before:
The reason your React component is re-rendering is likely because you create a new object reference on each render. When you pass an inline object as a prop, React's shallow comparison sees a different object every time. Wrap the object in `useMemo`.

After:
New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.
```

The maintainer reports 65% fewer output tokens on a small chat benchmark and warns that the skill adds about 1–1.5k input tokens per turn. A [JetBrains benchmark](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/) measured 8.5% on agentic coding tasks. Either workload can be net-negative; measure total usage.

#### 16) 🧠 Shape actionable output with i-have-adhd

Use [`i-have-adhd`](https://github.com/ayghri/i-have-adhd) for action-first output, not guaranteed compression.

```bash
# Claude Code
claude plugin marketplace add ayghri/i-have-adhd
claude plugin install i-have-adhd@i-have-adhd
# Invoke: /i-have-adhd

# Codex
codex plugin marketplace add ayghri/i-have-adhd --ref main
codex plugin add i-have-adhd@i-have-adhd
# Invoke: $i-have-adhd
```

Canonical action-first example:

```text
Bad: "Let's think about this. Your auth flow has a few moving pieces..."
Good: "Run `npm install jsonwebtoken`, then edit `src/auth.ts:42`."
```

| Need | Use |
| --- | --- |
| Maximum prose compression | Caveman |
| Action-first structure | `i-have-adhd` |
| Both | `i-have-adhd`, then Caveman `lite`; benchmark the combination |

Stop one mode with `stop adhd mode` or `stop caveman`. `normal mode` stops both. See the [installation matrix](https://github.com/ayghri/i-have-adhd/blob/main/INSTALL.md) and [rules](https://github.com/ayghri/i-have-adhd/blob/main/skills/i-have-adhd/SKILL.md).

#### 17) 🧹 Filter shell output with RTK

Run RTK only for commands whose raw output is materially noisy.

```bash
brew install rtk
rtk gain
rtk cargo test
```

```mermaid
flowchart LR
  A["rtk cargo test"] --> R["RTK"]
  R --> C["cargo test"]
  C -->|"raw output"| R
  R -->|"filtered output"| M["Agent context"]
```

An independent [JetBrains benchmark](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/) measured a 7.6% median cost increase at low effort and no material cost change at high effort. Measure the full task before keeping RTK.

Run `brew uninstall rtk` to remove the installed binary.

#### 18) ✂️ Filter shell output with SNIP

Use YAML filters when RTK's fixed command set does not fit.

```bash
brew install edouard-claude/tap/snip
snip init                                  # Claude Code
snip init --agent codex                    # Codex
snip init --uninstall                      # Remove from Claude Code
snip init --agent codex --uninstall        # Remove from Codex
```

See [`SNIP`](https://github.com/edouard-claude/snip).

#### 19) 🪝 Automate RTK where supported

Claude Code rewrites eligible Bash calls through a hook; Codex installs `AGENTS.md` guidance and still relies on the agent invoking RTK.

```bash
rtk init -g                    # Claude Code hook
rtk init -g --codex            # Codex instructions
rtk init -g --uninstall        # Remove the Claude Code integration
rtk init -g --codex --uninstall # Remove the Codex integration
```

Verify Claude Code with `/hooks`. For Codex, inspect the generated `AGENTS.md` and `RTK.md`; do not assume transparent rewriting. See [RTK's current client matrix](https://github.com/rtk-ai/rtk/blob/develop/README.md#supported-ai-tools) and [Claude Code filtering hooks](https://code.claude.com/docs/en/costs#offload-processing-to-hooks-and-skills).

#### 20) ✋ Cap Codex tool history

Limit stored tool output only after raw diagnostics have been captured.

```toml
tool_output_token_limit = 12000
```

Raise or remove the limit when evidence is truncated.

#### 21) 🚫 Block bulky paths

Prevent accidental reads of generated output and dependency trees.

Claude Code `.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./vendor/**)",
      "Read(./dist/**)"
    ]
  }
}
```

This saves tokens only when the agent would otherwise read those paths. Secrets are primarily a security concern. See [Claude Code permissions](https://code.claude.com/docs/en/permissions).

Remove only the added `deny` entries to restore access.

#### 22) 🔌 Limit MCP exposure

Disable unused servers and tools.

| Client | Control |
| --- | --- |
| Claude Code | Tool Search defers supported MCP schemas; avoid unnecessary `alwaysLoad` |
| Codex | `/mcp verbose`; `enabled = false`; `enabled_tools`; `disabled_tools` |

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
enabled = false
```

Set `enabled = true` or remove the override to restore the server.

See [Claude Code MCP](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), and [`mcp-installation.md`](mcp-installation.md).

### 🔴 Expert

#### 23) 🔬 Inspect model-visible behavior

Use diagnostics native to each client.

```text
Claude Code: /insights
Codex CLI:   codex debug prompt-input "Explain the current context sources"
```

See [Claude Code commands](https://code.claude.com/docs/en/commands) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

#### 24) 🎯 Route model and effort by difficulty

Use cheaper agents for bounded exploration while keeping difficult review and architecture on stronger settings.

Claude Code `.claude/agents/explorer.md`:

```yaml
---
name: explorer
description: Read-only codebase scout
tools: Read, Grep, Glob
model: haiku
effort: low
---
```

Codex `.codex/agents/explorer.toml`:

```toml
name = "explorer"
description = "Read-only codebase scout"
developer_instructions = "Explore without edits. Return paths, symbols, and decisive evidence only."
model = "gpt-5.6-terra"
model_reasoning_effort = "low"
```

See [Claude Code model configuration](https://code.claude.com/docs/en/model-config) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Delete these optional agent files to restore each client's default routing.

#### 25) 🧫 Isolate noisy work with subagents

Return only findings, evidence, blockers, and the command used.

```text
Delegate the test run. Return only failing tests, the shortest decisive error, and the command used.
```

```mermaid
flowchart LR
  M["Main context"] --> S["Test subagent"]
  S --> L["Full logs stay isolated"]
  S --> F["Failures + command"]
  F --> M
```

Subagents reduce main-context noise, not total token usage. See [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

#### 26) 🧊 Preserve Claude prompt-cache prefixes

Choose model, effort, and MCP tools before the first substantive prompt.

![Claude Code prompt caching reuses an unchanged request prefix](https://mintcdn.com/claude-code/VbDJw--l6T9a9Wvm/images/prompt-caching-prefix.svg?fit=max&auto=format&n=VbDJw--l6T9a9Wvm&q=85&s=f2e8f0b8298a50305fe428ca3f1d1594)

```text
/model sonnet
/effort medium
```

For Codex, observe `cached_input` through telemetry. See [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching) and [Codex observability](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry).

#### 27) ✅ Lower reasoning on routine work

Lower effort first, and disable thinking only when a representative task still passes.

```text
Claude Code: /effort low
Codex:       /reasoning
```

Claude Code `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_THINKING": "1"
  }
}
```

Codex `config.toml`:

```toml
model_reasoning_effort = "low"
```

Remove the environment variable and Codex key, then restore the prior `/effort` or `/reasoning` value.

See [Claude Code model configuration](https://code.claude.com/docs/en/model-config) and [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

## Verify the result

- Compare the same task, model, effort, and quality gate before and after each change.
- Record input, output, reasoning, tool-output, and subagent tokens when the client exposes them.
- Keep only changes that reduce total usage without weakening the required result.
