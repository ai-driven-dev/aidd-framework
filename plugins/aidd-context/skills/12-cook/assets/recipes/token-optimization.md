# Token optimization across coding agents

Cut token usage across coding agents without confusing general techniques with Claude Code or Codex commands.

- [Token optimization across coding agents](#token-optimization-across-coding-agents)
  - [Why](#why)
  - [Steps to cut token usage](#steps-to-cut-token-usage)
    - [🟢 Beginner](#-beginner)
      - [1) 📏 Record a before-and-after baseline](#1--record-a-before-and-after-baseline)
      - [2) 🔎 Inspect Claude's context breakdown](#2--inspect-claudes-context-breakdown)
      - [3) ✂️ Trim persistent instructions](#3-️-trim-persistent-instructions)
      - [4) 🧭 Plan before expensive rework](#4--plan-before-expensive-rework)
      - [5) ♻️ Reset between unrelated tasks](#5-️-reset-between-unrelated-tasks)
      - [6) 🗜️ Compact at a natural boundary](#6-️-compact-at-a-natural-boundary)
    - [🟡 Intermediate](#-intermediate)
      - [7) 📈 Export structured usage telemetry](#7--export-structured-usage-telemetry)
      - [8) 🗣️ Make concise output explicit](#8-️-make-concise-output-explicit)
      - [9) 🧹 Filter noisy shell output selectively](#9--filter-noisy-shell-output-selectively)
      - [10) 🔌 Limit MCP exposure by client](#10--limit-mcp-exposure-by-client)
    - [🔴 Expert](#-expert)
      - [11) 🔬 Inspect client behavior without mixing shortcuts](#11--inspect-client-behavior-without-mixing-shortcuts)
      - [12) 🎯 Route model and reasoning by difficulty](#12--route-model-and-reasoning-by-difficulty)
      - [13) 🧫 Isolate noisy work with subagents](#13--isolate-noisy-work-with-subagents)
      - [14) 🧊 Protect Claude Code prompt-cache stability](#14--protect-claude-code-prompt-cache-stability)
  - [In short](#in-short)

## Why

**Token usage** grows with persistent instructions, conversation history, tool output, and reasoning.

**Command names are not portable contracts**: `/usage`, `/compact`, `/model`, and keyboard shortcuts can differ across clients.

**Applicability labels** separate portable techniques from verified Claude Code and Codex mechanics. No command is labeled as universal.

## Steps to cut token usage

### 🟢 Beginner

#### 1) 📏 Record a before-and-after baseline

**Applies to:** Claude Code and Codex; their counters differ.

1. Run the same task with the same model and reasoning level before and after one optimization, then record the command result and quality gate.

| Client | Command | Record |
| --- | --- | --- |
| Claude Code | `/usage` | Session usage and available breakdowns |
| Codex | `/status` | Context usage under the current chat configuration |

Compare only within the same client. See [Claude Code costs](https://code.claude.com/docs/en/costs) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

#### 2) 🔎 Inspect Claude's context breakdown

**Applies to:** Claude Code. Codex has no equivalent component grid.

1. Run `/context all` only when the baseline shows context pressure.

```text
/context all
```

Target the largest persistent instruction, tool, or history source before compacting.

#### 3) ✂️ Trim persistent instructions

**Applies to:** All coding agents; the instruction file is client-specific.

Keep only durable rules in the file that loads for every task, and move specialized procedures to on-demand skills or referenced documents.

1. Open only the persistent instruction file documented by your client.
2. Remove duplicated architecture prose, one-off task details, and commands the agent can discover safely.
3. Keep completion criteria, constraints, and the canonical validation commands.

| Client | Native persistent instructions |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` or the closer `AGENTS.override.md` |
| Other clients | Use only the filename and precedence documented by that client |

```md
# Persistent instructions

- Lead with the result.
- Run the smallest relevant validation.
- Preserve unrelated user changes.
```

See [Claude Code memory](https://code.claude.com/docs/en/memory) and [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

#### 4) 🧭 Plan before expensive rework

**Applies to:** All coding agents as a technique; commands are client-specific.

Plan first when ambiguity or implementation risk makes a wrong direction expensive.

1. Enter the documented plan surface for your client.
2. Review scope, assumptions, and validation before authorizing implementation.
3. Use a separate read-only permission or sandbox setting when planning must prohibit writes; plan mode alone is not a universal security boundary.

| Client | Plan command |
| --- | --- |
| Claude Code | `/plan` or launch with `claude --permission-mode plan` |
| Codex | `/plan`; the command can include the first planning prompt |
| Other clients | Ask for a plan explicitly; use only a documented plan mode if one exists |

```text
/plan Propose the smallest implementation and its validation before editing
```

See [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) and [Codex best practices](https://learn.chatgpt.com/guides/best-practices).

#### 5) ♻️ Reset between unrelated tasks

**Applies to:** All coding agents as a technique; slash commands are verified only for the named clients.

Start a fresh conversation when the goal changes instead of paying repeatedly for stale turns.

1. Preserve any durable decision outside the disposable transcript.
2. Reset with the client-native action.

| Client | Fresh-context action |
| --- | --- |
| Claude Code | `/clear` |
| Codex CLI | `/clear` clears the terminal and starts a fresh chat; `/new` starts another chat without clearing the display |
| Other clients | Start a new conversation through the documented UI |

```text
Claude Code: /clear
Codex:       /new
```

#### 6) 🗜️ Compact at a natural boundary

**Applies to:** Claude Code and Codex; argument syntax differs.

Compact only when the same task still needs its earlier decisions and the context pressure justifies a summary.

1. Preserve the current goal, accepted decisions, failing evidence, and next validation.
2. Use only the syntax documented by your client.

| Client | Compact action |
| --- | --- |
| Claude Code | `/compact keep the accepted decisions, repro, and failing test` |
| Codex | `/compact`; no inline focus argument is documented |

```text
Claude Code: /compact keep the repro and failing test; drop file dumps
Codex:       /compact
```

See [Claude Code commands](https://code.claude.com/docs/en/commands) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

### 🟡 Intermediate

#### 7) 📈 Export structured usage telemetry

**Applies to:** Claude Code and Codex; their configuration and telemetry schemas differ.

Use your own OpenTelemetry collector when interactive usage commands are not enough for comparisons across sessions.

1. Enable the exporter for the selected client.
2. Keep prompt and tool content redacted unless an explicit audit requirement justifies collecting it.
3. Compare token types, model, agent, and tool output; treat cost attribution as an estimate unless it comes from the billing system.

Claude Code metrics export:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_METRICS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics \
OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/protobuf \
claude
```

Codex log export in `config.toml`:

```toml
[otel]
environment = "dev"
log_user_prompt = false

[otel.exporter."otlp-http"]
endpoint = "http://localhost:4318/v1/logs"
protocol = "binary"
```

Claude Code exports metrics such as `claude_code.token.usage`; Codex emits its own events and token fields. Do not query one client's schema under the other's names.

See [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage) and [Codex observability](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry).

#### 8) 🗣️ Make concise output explicit

**Applies to:** All coding agents as an instruction; persistent mechanisms are client-specific.

Short answers reduce output tokens only when the instruction does not sacrifice required evidence.

1. Add one concise rule to the client-native instruction surface.
2. Use the client-specific output control only when its documented scope matches the goal.

| Client | Persistent mechanism |
| --- | --- |
| Claude Code | A short custom file under `.claude/output-styles/`, selected through `/config` |
| Codex | `model_verbosity = "low"` for supported Responses API models, plus a short rule in `AGENTS.md` |
| Other clients | A documented response-style setting or persistent instruction |

```text
Answer directly. Preserve code, decisive errors, evidence, and security warnings; omit filler.
```

`model_reasoning_summary = "concise"` in Codex shortens the reasoning summary, not the final answer. See [Claude Code output styles](https://code.claude.com/docs/en/output-styles) and [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

#### 9) 🧹 Filter noisy shell output selectively

**Applies to:** Shell-capable coding agents; RTK and SNIP are third-party tools.

Reduce model-visible logs only when filtering cannot hide evidence needed for diagnosis.

1. Prefer a command's native `--quiet`, `--json`, filtering, or targeted-test option.
2. If that is insufficient, inspect and install a proxy such as [`RTK`](https://github.com/rtk-ai/rtk) or [`SNIP`](https://github.com/edouard-claude/snip).
3. Prefix only materially noisy commands and rerun the raw command when the filtered result is incomplete.

```bash
rtk cargo test
```

Published reduction figures measure model-visible command output, not independently verified billing savings. Never filter the first security failure or the only copy of a diagnostic log.

#### 10) 🔌 Limit MCP exposure by client

**Applies to:** MCP-capable agents; deferral behavior is client-specific.

Disable unused servers and expose only required tools without assuming every MCP client has Claude Code Tool Search.

1. Inventory enabled servers and tools.
2. Apply only controls documented by the selected client.

| Client | Documented control |
| --- | --- |
| Claude Code | Tool Search defers MCP tool schemas on supported models and providers; avoid `alwaysLoad` unless a small toolset is needed on nearly every turn |
| Codex | Inspect with `/mcp verbose`; disable an unused server with `enabled = false`, or restrict it with `enabled_tools` and `disabled_tools` |
| Other clients | Disable unused servers or tools through their documented configuration; do not assume schema deferral |

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
enabled = false
```

Codex exposes no public stable setting equivalent to Claude Code's `alwaysLoad`. See [Claude Code MCP](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), and [`mcp-installation.md`](mcp-installation.md).

### 🔴 Expert

#### 11) 🔬 Inspect client behavior without mixing shortcuts

**Applies to:** Claude Code for the commands below; Codex has no documented `/insights` equivalent.

Use client-native diagnostics instead of copying shortcuts between products.

1. In Claude Code, run `/insights` for a session-pattern report.
2. In Claude Code, press `Ctrl+O` to expand the detailed transcript.
3. In Codex, use OTel or the visible transcript for analysis; do not use `Ctrl+O` as a Claude-style transcript toggle.

```text
Claude Code: /insights
Claude Code: Ctrl+O
```

In Codex CLI, `Ctrl+O` copies the latest completed response. The experimental `codex debug prompt-input [PROMPT]` command renders model-visible prompt inputs as JSON, but it is not an `/insights` replacement.

#### 12) 🎯 Route model and reasoning by difficulty

**Applies to:** Claude Code and Codex; configuration formats and command semantics differ.

Use the lowest model and reasoning level that passes a representative task, then raise them only for risk or complexity.

1. Route routine exploration separately from difficult implementation or review.
2. Use the configuration native to each client.

| Client | Session control | Agent configuration |
| --- | --- | --- |
| Claude Code | `/model` and `/effort low` | `.claude/agents/*.md` or skill frontmatter with `model` and `effort` |
| Codex | `/model` and `/reasoning` | `.codex/agents/*.toml` with `model` and `model_reasoning_effort` |

Claude Code agent frontmatter:

```yaml
---
model: haiku
effort: low
---
```

Codex project agent:

```toml
name = "explorer"
description = "Read-only codebase scout"
model = "gpt-5.6-terra"
model_reasoning_effort = "low"
```

Codex skills do not use Claude Code's `model` and `effort` frontmatter. See [Claude Code model configuration](https://code.claude.com/docs/en/model-config) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

#### 13) 🧫 Isolate noisy work with subagents

**Applies to:** Coding agents with documented subagent support; configuration is client-specific.

Use subagents for context isolation, parallelism, or specialist quality, not as an assumed reduction in total tokens.

1. Delegate high-volume exploration, test logs, or independent review.
2. Ask for a short result containing only findings, evidence, and blockers.
3. Keep tightly coupled edits in one agent to avoid coordination overhead.

```text
Delegate the test run to one subagent. Return only failing tests, the shortest decisive error, and the command used.
```

Both Claude Code and Codex give subagents separate working context, but their own model calls still consume tokens and can increase total usage. See [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

#### 14) 🧊 Protect Claude Code prompt-cache stability

**Applies to:** Claude Code. No equivalent user-facing Codex cache-invalidation contract is documented here.

Keep the request prefix stable during one task so prompt caching can reuse it.

1. Choose the model and effort before the first substantive prompt.
2. Change them mid-task only when the quality gain justifies a cache miss.
3. Keep MCP tools deferred; a change to tools loaded into the prefix can invalidate that layer.

```text
/model sonnet
/effort medium
```

For Codex, prompt caching is service-managed rather than a documented `config.toml` control; observe `cached_input` through Codex telemetry instead of transposing Claude settings. See [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching) and [Codex observability](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry).

## In short

Measure first, label every command by client, then reduce persistent instructions, stale history, noisy output, unnecessary tools, and excessive reasoning without hiding evidence or weakening quality.
