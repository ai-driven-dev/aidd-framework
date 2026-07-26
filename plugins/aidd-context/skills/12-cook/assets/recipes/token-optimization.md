# Token optimization across coding agents

Cut token usage with seven measurable actions.

## Why

**Token usage** grows with persistent instructions, stale history, tool output, and excessive reasoning.

## Steps to cut token usage

### 1) 📏 Measure one fixed task

**Applies to:** All coding agents; commands are client-specific.

1. Record usage before and after one optimization while keeping the task, model, reasoning level, and quality gate unchanged.

| Client | Session measurement |
| --- | --- |
| Claude Code | `/usage` |
| Codex | `/status` for session configuration and remaining context |
| Other clients | Use only the documented session or context counter |

Do not use Codex `/usage` for this comparison: it reports account activity, not the current session. See [Claude Code commands](https://code.claude.com/docs/en/commands) and [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

### 2) ✂️ Reduce persistent instructions

**Applies to:** All coding agents; instruction files are client-specific.

1. Edit the persistent instruction file to keep only constraints, completion criteria, and canonical validation commands.

| Client | Persistent instructions |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` or the closer `AGENTS.override.md` |
| Other clients | Use only the documented instruction surface |

```md
- Answer directly; preserve decisive evidence.
- Run the smallest relevant validation.
- Preserve unrelated user changes.
```

See [Claude Code memory](https://code.claude.com/docs/en/memory) and [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

### 3) ♻️ Drop stale conversation

**Applies to:** All coding agents; commands are verified only for the named clients.

1. Choose from the task relationship, then run the matching client action.

| Situation | Claude Code | Codex | Other clients |
| --- | --- | --- | --- |
| New goal | `/clear` | `/new` | Start a new conversation |
| Same goal, context full | `/compact keep the goal, decisions, failure, and next check` | `/compact` (no documented inline focus argument) | Use documented compaction |

### 4) 🧭 Plan risky work once

**Applies to:** All coding agents; plan surfaces are client-specific.

1. For risky work, run the plan command before implementation.

| Client | Planning action |
| --- | --- |
| Claude Code | `/plan Propose the smallest implementation and validation` |
| Codex | `/plan Propose the smallest implementation and validation` |
| Other clients | Ask for a plan; use a documented plan mode when available |

Expected: the plan names scope, assumptions, and validation.

See [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) and [Codex best practices](https://learn.chatgpt.com/guides/best-practices).

### 5) 🧹 Reduce tool output

**Applies to:** All coding agents.

1. Run the narrowest command that answers the question.

```bash
git diff --stat
```

### 6) 🔌 Disable unused MCP servers

**Applies to:** MCP-capable agents; configuration is client-specific.

1. Disable every MCP server unused by the task.

| Client | Exposure control |
| --- | --- |
| Claude Code | `/mcp disable server-name` |
| Codex | Set `enabled = false` in the server's `config.toml` entry |
| Other clients | Use the documented server control |

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
enabled = false
```

See [Claude Code MCP](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), and [`mcp-installation.md`](mcp-installation.md).

### 7) 🎯 Lower reasoning for routine work

**Applies to:** Claude Code and Codex; controls differ.

1. Before work starts, select the lowest reasoning level that passes a representative quality gate.

| Client | Reasoning control |
| --- | --- |
| Claude Code | `/effort low` |
| Codex | `/reasoning` |

In Claude Code, keep that choice stable during the task to preserve prompt-cache reuse. See [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching).
