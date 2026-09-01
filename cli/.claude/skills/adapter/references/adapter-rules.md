# Reference: Adapter Rules

## Class shape

- Class with `*Adapter` suffix
- Implements exactly one port interface
- No business logic — I/O and format translation only
- All dependencies injected via constructor as `private readonly`, typed as port interfaces

## Technical constants ownership

Adapters own ALL technical constants for their integration domain:
- Runtime names (hook identifiers, OS-level strings)
- System file paths (config file locations, lockfile names)
- Protocol details (API base URLs, endpoint patterns)
- Error-pattern regexes for classifying third-party failures

None of these belong in ports, use-cases, or domain models.

## Error translation

- `try/catch` is allowed only to convert third-party errors to typed domain exceptions
- Never let raw errors (Node.js system errors, HTTP errors, git errors) cross the port boundary
- Import typed exceptions from `src/kernel/errors.ts`
- Example: `throw new PluginFetchError(\`git clone failed: ${scrubCredentials(msg)}\`)`

## File naming

- `<concept>-adapter.ts` — e.g. `plugin-fetcher-adapter.ts`
- One adapter per file; one port per adapter

## Agnostic shape example

```typescript
const WIDGET_API_BASE = "https://api.example.com/v1";
const WIDGET_NOT_FOUND_RE = /404 Not Found/;

export class WidgetFetcherAdapter implements WidgetFetcher {
  constructor(private readonly http: HttpClient) {}

  async fetch(widgetId: string, options?: WidgetFetchOptions): Promise<WidgetData> {
    try {
      return await this.http.get(`${WIDGET_API_BASE}/widgets/${widgetId}`);
    } catch (err) {
      if (WIDGET_NOT_FOUND_RE.test(String(err))) {
        throw new WidgetNotFoundError(widgetId);
      }
      throw new WidgetFetchError(`fetch failed: ${String(err)}`);
    }
  }
}
```
