# Search Action

Execute a web search using You.com's Search API.

## Implementation

Call the You.com Search API with the following approach:

1. **Authentication Check**
   - Look for `YDC_API_KEY` environment variable
   - If present, use authenticated endpoint: `https://api.you.com/v1/agents/search`
   - If absent, use keyless endpoint: `https://api.you.com/mcp?profile=free`

2. **Request Format**
   ```typescript
   // Authenticated mode
   const response = await fetch('https://api.you.com/v1/agents/search', {
     method: 'GET', 
     headers: {
       'X-API-Key': process.env.YDC_API_KEY,
       'User-Agent': 'aidd-framework-youcom-plugin/1.0.0'
     },
     params: {
       query: searchQuery,
       count: resultCount || 10
     }
   });

   // Keyless mode (MCP)
   // Use MCP client to call you-search tool
   ```

3. **Response Processing**
   - Parse JSON response
   - Extract results from `results.web` array
   - Format each result with: title, url, snippet, published_date
   - Handle errors gracefully with fallback messages

4. **Output Format**
   ```markdown
   ## Search Results for: "{query}"

   ### 1. [Result Title](URL)
   **Source**: domain.com | **Published**: date
   Result snippet text...

   ### 2. [Next Result](URL)  
   **Source**: domain.com | **Published**: date
   Next result snippet...

   ---
   *Searched {count} results using You.com Search API*
   ```

## Error Handling

- **401 Unauthorized**: Invalid API key, suggest keyless mode
- **429 Rate Limited**: Suggest waiting or upgrading plan  
- **Network Error**: Provide offline alternatives
- **No Results**: Suggest query refinement

## Testing

Test with queries like:
- "TypeScript best practices 2026"
- "AI coding assistant comparison"
- "Claude Code plugin development guide"