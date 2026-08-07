# MCP installations

Choose between a CLI and MCP by capability, then install the integration through the configuration native to your AI client.

<!-- Sources checked: 2026-08-07. -->

## Steps to install the right integration

### 1) 🔎 Choose by capability

Choose the smallest interface that fully covers the workflow, authentication model, and data scope.

1. Compare the exact operation you need against the table.

| Need | Prefer a CLI | Prefer MCP |
| --- | --- | --- |
| Scriptable commands and raw API calls | The official CLI covers the operation and its output is manageable | The client needs typed discovery or structured results |
| Live design or knowledge context | The CLI exposes the required operation and data | The server advertises the required tools, resources, or prompts |
| Authentication | The CLI's login and credential storage fit the workflow | The server's authentication, requested scopes, and host credential storage fit the workflow |
| Context cost | Output is requested only when the command runs | The client supports deferred loading such as [Claude Code Tool Search](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search) |

The last column is a decision heuristic for this recipe, not a provider guarantee.

| Service | CLI route | MCP route | Recipe heuristic |
| --- | --- | --- | --- |
| [GitHub](https://github.com/github/github-mcp-server) | [`gh`](https://cli.github.com/) | Remote toolsets, including read-only modes | CLI for routine API work; MCP for typed or remote-only capabilities |
| [Atlassian](https://www.atlassian.com/platform/rovo-mcp) | [`acli`](https://developer.atlassian.com/cloud/acli/guides/introduction/) for Jira | The current Rovo MCP tool catalog; [OAuth 2.1 is recommended](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-oauth-2-1/), with API-token authentication only when an administrator enables it | Decide from the Atlassian product, operation, and permitted authentication |
| [Playwright](https://github.com/microsoft/playwright-mcp) | [`@playwright/cli`](https://playwright.dev/agent-cli/installation) | `@playwright/mcp` | CLI for direct browser automation; MCP for live tool calls |
| [Figma](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) | The [`@figma/code-connect` CLI](https://developers.figma.com/docs/code-connect/cli-reference/) manages component mappings, not live design context or canvas operations | `https://mcp.figma.com/mcp` | CLI for Code Connect mappings; MCP for live design and canvas workflows |
| [Notion](https://developers.notion.com/guides/mcp/get-started-with-mcp) | The official [`ntn` CLI](https://developers.notion.com/cli/get-started/overview) supports API, page, data-source, file, and Worker operations | `https://mcp.notion.com/mcp` | CLI for scripts and raw API work; MCP for agent workflows, with human confirmation |

### 2) ⌨️ Install the CLI route

The agent-oriented Playwright CLI is a direct browser alternative to Playwright MCP.

1. Install `@playwright/cli` from the [official guide](https://playwright.dev/agent-cli/installation), then invoke its `playwright-cli` executable.

```bash
npm install -g @playwright/cli@latest
playwright-cli open https://example.com --headed
npm uninstall -g @playwright/cli
```

Use `npx playwright test` for the test runner and `npx playwright codegen` for test generation; they are different command surfaces.

### 3) 🔌 Install the MCP route

Use a provider-supported client and distinguish the recommended plugin route from manual MCP configuration.

1. Pick the [documented Figma route](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) for your client.

| Client | Figma's recommended route | Manual alternative and scope |
| --- | --- | --- |
| Claude Code | `claude plugin install figma@claude-plugins-official` | `claude mcp add --transport http --scope project figma https://mcp.figma.com/mcp` writes project configuration to `.mcp.json` under `mcpServers` |
| Codex | In the Codex app, open **Plugins**, select **+** next to Figma, then **Install Figma** | `codex mcp add figma --url https://mcp.figma.com/mcp` writes to [`~/.codex/config.toml`](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) under `mcp_servers`; trusted projects may instead use `.codex/config.toml` |
| Cursor | Run `/add-plugin figma` | Manual project configuration uses `.cursor/mcp.json` under `mcpServers` |
| GitHub Copilot in VS Code | Run **MCP: Open Workspace Folder MCP Configuration**, paste Figma's documented server object, then select **Start** | Workspace configuration uses `.vscode/mcp.json` under `servers` |

```bash
claude plugin install figma@claude-plugins-official
```

[Figma accepts only clients in its MCP catalog](https://www.figma.com/mcp-catalog/); do not extrapolate these instructions to an unlisted host.

### 4) 🔐 Restrict access

Use the server's documented authentication, expose only required capabilities, and enforce confirmation for mutations.

1. If the remote server uses OAuth, authorize it in the client and review the requested scopes; otherwise follow its documented authentication method.
2. Prefer read-only endpoints, toolsets, or allowlists when the workflow only reads.
3. Configure the host to require confirmation for mutating tools; if it cannot, disable write tools or use a provider-enforced read-only mode.

[GitHub documents](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md#read-only-mode) this VS Code-format server-entry fragment; place it under `servers.github` in `.vscode/mcp.json`, or adapt the wrapper to the selected host:

```json
{
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "X-MCP-Toolsets": "repos,issues",
    "X-MCP-Readonly": "true"
  }
}
```

[Notion MCP inherits the connected user's workspace access](https://developers.notion.com/guides/mcp/mcp-security-best-practices), so review every write and any data sent to another tool.

### 5) ✅ Verify the connection

Verify the configured server, authenticated identity, exposed tools, and one read-only operation before relying on it.

1. Inspect the server through the client, then run a harmless read.

```text
Claude Code: /mcp
Codex:       codex mcp list
Cursor:      Settings > Cursor Settings > Tools & MCP
VS Code:     MCP: List Servers
```

Figma's documented successful Claude Code flow ends with:

```text
Authentication successful. Connected to figma
```

Use Figma's read-only [`whoami`](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/#whoami-remote-only) tool to confirm the authenticated email, plans, and seat type.

### 6) 🧹 Remove local access

Clearing authentication and local configuration stops the client from using the server.

1. Clear authentication before removing the server entry.
2. Remove the server or plugin from the client.

| Client | Clear authentication | Remove local configuration |
| --- | --- | --- |
| Claude Code | Run `/mcp`, select Figma, then **Clear authentication** | Plugin: `claude plugin uninstall figma@claude-plugins-official`; manual project server: `claude mcp remove --scope project figma` |
| Codex | Manual server: `codex mcp logout figma` | Plugin: remove Figma in the Codex app's **Plugins** panel; manual server: `codex mcp remove figma` |
| Cursor | Disconnect Figma under **Settings > Cursor Settings > Tools & MCP** | Remove the Figma plugin or its manual `.cursor/mcp.json` entry |
| GitHub Copilot in VS Code | Select the server through **MCP: List Servers** | Uninstall the server or remove its `.vscode/mcp.json` entry |

```bash
codex mcp logout figma
codex mcp remove figma
```

Removing configuration alone does not prove that the OAuth grant was revoked.

### 7) 🚫 Revoke provider access

Revoking the provider grant invalidates the remote OAuth authorization independently of local configuration.

1. For Figma, open [**Settings > Security > Connected apps**](https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure).
2. Find the MCP client and select **Revoke access**.

```text
Figma > Settings > Security > Connected apps > Revoke access
```

## Verify

- The server appears in the chosen client's server list with the expected transport and scope.
- Authentication uses the intended account and workspace; for Figma, `whoami` returns that identity.
- Only the required tools are enabled; mutating calls require confirmation or are disabled.
- Authentication clearing, local removal, and provider revocation pass as three separate checks.
