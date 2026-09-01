# 02 - Implement Adapter

Write the `*Adapter` class that fulfills the port interface, owns all technical constants, and translates third-party errors to typed domain exceptions.

## Inputs

- `adapter-name` (required) - string, PascalCase name with `Adapter` suffix (e.g. `PluginFetcherAdapter`)
- `port-interface` (required) - string, the port interface name from 01

## Outputs

```typescript
// src/infrastructure/adapters/widget-fetcher-adapter.ts
const WIDGET_API_BASE = "https://api.example.com/v1";

export class WidgetFetcherAdapter implements WidgetFetcher {
  constructor(private readonly http: HttpClient) {}

  async fetch(widgetId: string, options?: WidgetFetchOptions): Promise<WidgetData> {
    // ... I/O translation only, error wrapped to typed domain exception
  }

  async list(filter: WidgetFilter): Promise<WidgetSummary[]> {
    // ... I/O translation only
  }
}
```

## Depends on

- `01-define-port`

## Process

1. Create `src/infrastructure/adapters/<kebab-name>-adapter.ts`. Class name `<Name>Adapter implements <Port>`.
2. Inject all dependencies via constructor as `private readonly`, typed as port interfaces — never concrete types.
3. Own all technical constants at module level (`CONSTANT_CASE`): runtime names, OS paths, protocol strings, error-pattern regexes. None of these belong in the port or the use-case.
4. For each port method: translate I/O — no domain decisions, no business logic.
5. Wrap third-party errors in `try/catch` only to convert them to typed domain exceptions from `src/kernel/errors.ts`. Never let raw errors cross the port boundary.
6. All methods (public or private) ≤20 lines — extract private helpers as needed per `.claude/rules/06-design-patterns/6-method-size.md`.

## Test

Run `pnpm typecheck` — exits 0 and `pnpm lint` exits 0 confirming the adapter fully satisfies the port interface.
