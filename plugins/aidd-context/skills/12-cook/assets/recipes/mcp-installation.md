# MCP installations

Choose between a CLI and MCP, then install the integration through the selected client's native configuration.

## Why

**Capability fit** decides whether a CLI or MCP is the smaller interface.

**Least privilege** limits exposed tools, OAuth scope, and write access.

## Steps to install the right integration

### 1) 🔎 Choose the interface

1. Match the required operation to the smallest interface that supports it.

| Need | Choose CLI | Choose MCP |
| --- | --- | --- |
| Scriptable command or raw API call | The official CLI covers it | No CLI support |
| Live design or knowledge context | The CLI exposes it | The server exposes the required tool or resource |
| Authentication | CLI credentials fit the workflow | MCP OAuth scopes fit the workflow |

### 2) ⬇️ Install the CLI route

1. Install the provider's official CLI.

```bash
npm install -g @playwright/cli@latest
```

### 3) ⌨️ Invoke the CLI

1. Run one harmless command before giving the CLI to an agent.

```bash
playwright-cli open https://example.com --headed
```

See the [Playwright CLI guide](https://playwright.dev/agent-cli/installation).

### 4) 🔌 Install the MCP route

1. Use the installation route documented for the selected client.

| Client | Figma installation |
| --- | --- |
| Claude Code | `claude plugin install figma@claude-plugins-official` |
| Codex | Install Figma from the app's **Plugins** panel, or run `codex mcp add figma --url https://mcp.figma.com/mcp` |
| Cursor | Run `/add-plugin figma` |
| GitHub Copilot in VS Code | Run **MCP: Open Workspace Folder MCP Configuration**, paste Figma's server object, then select **Start** |

Use only clients listed in [Figma's MCP catalog](https://www.figma.com/mcp-catalog/). See [Figma's installation guide](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/).

### 5) 🔐 Restrict exposed tools

1. Allow only the tools required by the workflow.

Codex example in `config.toml`:

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
enabled_tools = ["whoami", "get_design_context"]
```

For other clients, use only their documented tool restriction controls.

### 6) ✅ Verify one read

1. Ask the client to call Figma `whoami`.

Expected: the returned email, plan, and seat match the intended account. See Figma's [`whoami` reference](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/#whoami-remote-only).

### 7) 🔓 Clear authentication

1. Clear the client's stored Figma authentication.

| Client | Action |
| --- | --- |
| Claude Code | `/mcp` > Figma > **Clear authentication** |
| Codex | `codex mcp logout figma` |
| Cursor | Disconnect Figma under **Settings > Cursor Settings > Tools & MCP** |
| GitHub Copilot in VS Code | Use **MCP: List Servers** |

### 8) 🗑️ Remove the integration

1. Remove the local Figma server or plugin.

| Client | Action |
| --- | --- |
| Claude Code | `claude plugin uninstall figma@claude-plugins-official` |
| Codex | `codex mcp remove figma` |
| Cursor | Remove Figma under **Settings > Cursor Settings > Tools & MCP** |
| GitHub Copilot in VS Code | Remove its `.vscode/mcp.json` entry |

### 9) 🚫 Revoke provider access

1. Open Figma [**Settings > Security > Connected apps**](https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure) and select **Revoke access**.

Expected: Figma no longer lists the client under connected apps.
