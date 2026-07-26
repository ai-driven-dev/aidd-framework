# MCP installations

Decide when to use an MCP server vs a CLI, and wire up the recommended ones.

- [MCP installations](#mcp-installations)
  - [Why](#why)
  - [Steps to choose and install the right integration](#steps-to-choose-and-install-the-right-integration)
    - [1) 🔎 Check for a CLI first](#1--check-for-a-cli-first)
    - [2) 🔌 Add MCP only when it is the right integration](#2--add-mcp-only-when-it-is-the-right-integration)
    - [3) ✅ Verify the integration](#3--verify-the-integration)

## Why

**MCP servers** load their full tool schema into every turn, which bloats the context window.

**CLI calls** cost a few tokens and return only what you ask for.

**Reach for MCP only when no CLI covers the service.**

**Audit what you install** before connecting any server.

## Steps to choose and install the right integration

### 1) 🔎 Check for a CLI first

The CLI is usually cheaper because it does not inject a large tool schema into every turn.

1. Look for an official CLI before adding an MCP server.
2. Install and authenticate the CLI when it covers the workflow.
3. Keep MCP for services with no useful CLI alternative.

| Service                           | Official MCP                                                                                          | CLI alternative                                                                    | Recommended                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **GitHub**                        | [`api.githubcopilot.com/mcp/`](https://github.com/github/github-mcp-server)                           | [`gh`](https://cli.github.com/)                                                    | **CLI**: issues, PRs, releases, and API calls without the MCP schema cost   |
| **Atlassian** (Jira / Confluence) | [`mcp.atlassian.com/v1/mcp`](https://www.atlassian.com/platform/remote-mcp-server)                    | [`acli`](https://developer.atlassian.com/cloud/acli/guides/introduction/) for Jira | **CLI** for Jira, **MCP** for Confluence                                    |
| **Playwright**                    | [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp)                                      | [`npx playwright`](https://playwright.dev/docs/test-cli)                           | **CLI**: a real browser through `playwright open`, `codegen`, or `--headed` |
| **Figma**                         | [`mcp.figma.com/mcp`](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) | none for design data                                                               | **MCP**                                                                     |
| **Notion**                        | [`mcp.notion.com/mcp`](https://developers.notion.com/guides/mcp/get-started-with-mcp)                 | none official                                                                      | **MCP**                                                                     |

### 2) 🔌 Add MCP only when it is the right integration

An MCP config belongs in the assistant's MCP configuration file, and only for services where MCP is the best available interface.

1. Read the provider docs and permission model.
2. Add the server to `.mcp.json`.
3. Restart the assistant so it picks up the new tools.

```json
{
  "mcpServers": {
    "figma": { "url": "https://mcp.figma.com/mcp" }
  }
}
```

### 3) ✅ Verify the integration

Verification keeps a bad install out of later sessions.

1. For MCP, confirm the tools appear in the assistant.
2. For a CLI, run a read-only identity command.

```bash
$ gh auth status
github.com
  ✓ Logged in to github.com account octocat
```
