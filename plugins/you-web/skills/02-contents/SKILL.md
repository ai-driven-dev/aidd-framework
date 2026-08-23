---
name: 02-contents
description: Extract full content from URLs using You.com Contents API. Returns complete text content from web pages for analysis, research, or citation.
argument-hint: URL or list of URLs
---

# You.com Content Extraction

Extracts complete text content from web pages using You.com's Contents API. Transforms URLs into readable, structured text suitable for analysis, research, or citation.

## Usage

Use this skill when you need:
- Full text content from specific URLs
- Clean, readable text from web pages
- Content for analysis or summarization
- Source material for research or fact-checking

Often used after `you-web:01-search` to get complete content from promising results.

## Authentication

Same authentication model as search:

1. **Authenticated mode**: Set `YDC_API_KEY` environment variable
2. **Keyless mode**: Basic functionality without API key

## Parameters

- **urls** (required): Single URL string or array of URLs
- **include_metadata** (optional): Include page metadata (title, description, etc.)

## Output Format

Returns structured content with:
- **URL**: Source URL
- **Title**: Page title
- **Text**: Extracted clean text content
- **Metadata**: Publication date, author, description (when available)
- **Word Count**: Approximate length
- **Extraction Status**: Success/failure indicator

## Example Usage

```
/you-web:02-contents "https://docs.anthropic.com/claude/docs"
/you-web:02-contents ["https://example.com/article1", "https://example.com/article2"]
```

## Content Processing

The skill:
- Removes ads, navigation, and boilerplate
- Preserves article structure and formatting
- Handles dynamic content and JavaScript-rendered pages
- Respects robots.txt and rate limiting

## Error Handling

- Gracefully handles inaccessible URLs
- Reports specific failure reasons (403, 404, timeout, etc.)
- Continues processing other URLs if one fails
- Provides alternative approaches for blocked content

## Integration with Other Skills

Content extracted by this skill works well with:
- AIDD analysis and review skills
- `you-web:03-research` for synthesis
- `aidd-refine:04-fact-check` for verification
- Any skill requiring source text input