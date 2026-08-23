← [aidd-framework](../../README.md)

# you-web

You.com web search integration plugin for the AI-Driven Development framework.

> Status: stable

Install with `/plugin install you-web@aidd-framework`, then use `/you-web:01-search` for web search.

Provides current web search, URL content extraction, and research synthesis capabilities using You.com's Search, Contents, and Research APIs. Supports both authenticated (enhanced) and keyless (basic) usage modes.

## Skills

| Bracket ID | Skill | Description |
|------------|-------|-------------|
| [1.0] | [search](skills/01-search/SKILL.md) | Current web search using You.com API with authentication support and structured results |
| [1.1] | [contents](skills/02-contents/SKILL.md) | Extract full text content from URLs for analysis, research, and citation |  
| [1.2] | [research](skills/03-research/SKILL.md) | Comprehensive multi-source research synthesis with citations and confidence levels |

## Quick Start

### 1. Install the plugin

```bash
# Add the marketplace (if not already added)
/plugin marketplace add ai-driven-dev/framework

# Install You.com plugin
/plugin install you-web@aidd-framework
```

### 2. Basic Usage (Keyless)

Works immediately without setup:

```bash
/you-web:01-search "latest AI coding tools"
/you-web:02-contents "https://docs.anthropic.com/claude"
```

### 3. Enhanced Usage (Authenticated)

For better results and higher limits:

1. Get a You.com API key: https://you.com/platform/api-keys
2. Set environment variable: `export YDC_API_KEY=your_key_here`
3. Use same commands for enhanced functionality

## Authentication Modes

| Mode | Setup | Features | Rate Limits |
|------|--------|----------|-------------|
| **Keyless** | None | Basic search & content | Limited |  
| **Authenticated** | `YDC_API_KEY` env var | Full search, content, research | Higher limits |

## Integration with AIDD

You.com skills work seamlessly with other AIDD plugins:

- **With aidd-refine**: Use `/you-web:01-search` then `/aidd-refine:04-fact-check` for verification
- **With aidd-dev**: Research technical topics then implement with development skills  
- **With aidd-context**: Use `/you-web:03-research` then `/aidd-context:10-learn` to capture insights
- **With aidd-pm**: Research requirements and user needs for better product planning

## Example Workflows

### Research & Implement
```bash
/you-web:03-research "Next.js 14 app router best practices"
/aidd-dev:01-plan # Plan implementation based on research
/aidd-dev:02-implement # Implement the planned changes
```

### Fact-Check & Refine  
```bash
/you-web:01-search "TypeScript 5.6 new features"
/you-web:02-contents "https://devblogs.microsoft.com/typescript/..."
/aidd-refine:04-fact-check # Verify claims against sources
```

### Market Research
```bash
/you-web:03-research "AI coding assistant market 2026" depth=comprehensive
/aidd-context:10-learn # Capture strategic insights
/aidd-pm:01-brief # Create product brief based on findings
```

## Cross-Platform Support

This plugin works across all AIDD-supported platforms:
- **Claude Code** (native)
- **Cursor** (marketplace + flat)
- **GitHub Copilot** (marketplace + flat)
- **Codex** (marketplace + flat)
- **OpenCode** (flat)

## Troubleshooting

### "API key invalid" errors
- Check `YDC_API_KEY` environment variable is set correctly
- Verify key at https://you.com/platform/api-keys
- Plugin falls back to keyless mode if key is invalid

### Rate limiting
- Authenticated mode has higher limits
- Space out requests in keyless mode
- Consider upgrading You.com plan for heavy usage

### No results returned  
- Try broader or more specific search terms
- Check internet connectivity
- Some topics may have limited coverage

## Contributing

Found an issue or want to contribute? 
- Plugin source: https://github.com/youdotcom-oss/agent-skills
- Framework issues: https://github.com/ai-driven-dev/framework/issues
- You.com API docs: https://you.com/docs

## License

MIT - see [LICENSE](../../LICENSE) for details.