---
name: 03-research
description: Conduct comprehensive research using You.com Research API. Synthesizes information from multiple sources into cited, structured research reports.
argument-hint: research topic or question
---

# You.com Research Synthesis

Conducts comprehensive research using You.com's Research API, automatically searching multiple sources, analyzing content, and synthesizing findings into structured reports with proper citations.

## Usage

Use this skill for:
- In-depth research on complex topics
- Multi-source analysis and synthesis
- Comprehensive reports with citations
- Due diligence and fact-finding
- Academic or professional research needs

This is the highest-level You.com skill that combines search and content analysis.

## Authentication

Requires authentication for full functionality:
- Set `YDC_API_KEY` environment variable for best results
- Limited functionality available in keyless mode

## Parameters

- **topic** (required): Research question or topic
- **depth** (optional): Research depth - "quick", "standard", "comprehensive"
- **sources** (optional): Number of sources to analyze (default: 10)
- **focus_areas** (optional): Specific aspects to emphasize

## Output Format

Returns structured research report with:
- **Executive Summary**: Key findings overview
- **Detailed Analysis**: Organized findings by theme
- **Source Citations**: Full bibliography with URLs
- **Confidence Levels**: Reliability assessment of claims
- **Related Questions**: Suggested follow-up research
- **Methodology**: Sources used and analysis approach

## Example Usage

```
/you-web:03-research "Impact of AI coding assistants on developer productivity"
/you-web:03-research "TypeScript vs JavaScript performance 2026" depth=comprehensive
/you-web:03-research "Claude Code plugin architecture" focus_areas=["security", "extensibility"]
```

## Research Process

The skill automatically:
1. Generates comprehensive search queries
2. Retrieves content from multiple sources
3. Analyzes and cross-references information
4. Synthesizes findings into coherent narrative
5. Provides proper citations and confidence levels
6. Identifies gaps and contradictions

## Quality Controls

- Cross-references claims across sources
- Flags conflicting information
- Assesses source reliability
- Provides confidence indicators
- Suggests additional verification when needed

## Integration with AIDD

Works seamlessly with:
- `aidd-refine:04-fact-check` for additional verification
- `aidd-dev` skills for technical implementation
- `aidd-pm` skills for requirements analysis
- `aidd-context:10-learn` for capturing insights