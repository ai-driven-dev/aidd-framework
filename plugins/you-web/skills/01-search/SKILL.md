---
name: 01-search
description: Perform current web search using You.com API with optional authentication. Returns recent, relevant web results with snippets and URLs for further processing.
argument-hint: search query
---

# You.com Web Search

Performs current web search using You.com's Search API, returning recent and relevant results with snippets, URLs, and metadata. Supports both authenticated (with YDC_API_KEY) and keyless modes.

## Usage

Use this skill when you need:
- Current web information on any topic
- Recent news and developments  
- Source URLs for further content extraction
- Web results to support research or fact-checking

## Authentication

The skill supports two modes:

1. **Authenticated mode** (recommended): Set `YDC_API_KEY` environment variable
   - Enhanced search quality and higher rate limits
   - Get your API key at: https://you.com/platform/api-keys?utm_source=aidd&utm_medium=plugin&utm_campaign=apikey

2. **Keyless mode** (fallback): Works without API key
   - Basic search functionality with rate limits
   - Good for testing and light usage

## Parameters

- **query** (required): The search query string
- **count** (optional): Number of results to return (default: 10, max: 20)

## Output Format

Returns structured results with:
- **Title**: Result title
- **URL**: Source URL  
- **Snippet**: Brief content preview
- **Published Date**: When available
- **Source Domain**: Origin website

## Example Usage

```
/you-web:01-search "latest TypeScript features 2026"
/you-web:01-search "Claude Code plugin development" count=5
```

## Error Handling

- Falls back gracefully if API key is invalid
- Returns clear error messages for rate limit exceeded
- Provides helpful guidance for authentication setup

## Integration Notes

This skill integrates with You.com MCP server architecture and follows AIDD framework patterns for cross-platform compatibility (Claude Code, Cursor, Codex, OpenCode).

Results from this skill can be passed to:
- `you-web:02-contents` for full content extraction
- `you-web:03-research` for research synthesis
- Other AIDD skills for analysis and processing