# You.com MCP Integration

The You.com plugin leverages MCP (Model Context Protocol) for standardized tool access across platforms.

## MCP Endpoints

| Endpoint | Purpose | Authentication |
|----------|---------|----------------|
| `https://api.you.com/mcp` | Full You.com MCP server | YDC_API_KEY required |
| `https://api.you.com/mcp?profile=free` | Keyless basic search | None |  
| `https://you.com/docs/_mcp/server` | You.com docs search | None |

## Available Tools

### Authenticated MCP (`https://api.you.com/mcp`)
- `you-search`: Web search with enhanced results
- `you-contents`: URL content extraction  
- `you-research`: Multi-source research synthesis

### Keyless MCP (`https://api.you.com/mcp?profile=free`)  
- `you-search`: Basic web search (rate limited)

## Integration Pattern

The plugin abstracts MCP complexity from users while providing:
1. **Auto-detection**: Checks for API key availability
2. **Fallback gracefully**: Uses keyless mode when needed  
3. **Consistent interface**: Same skill commands regardless of mode
4. **Error handling**: Clear messages for authentication issues

## Cross-Platform Compatibility

MCP integration ensures the plugin works identically across:
- Claude Code (native MCP support)
- Cursor (MCP bridge)  
- Codex (MCP adapter)
- OpenCode (MCP compatibility layer)
- GitHub Copilot (MCP translation)