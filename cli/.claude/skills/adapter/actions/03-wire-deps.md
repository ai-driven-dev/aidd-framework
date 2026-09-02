# 03 - Wire Deps

Register the new adapter in the dependency factory so commands can use it via `createDeps`.

## Inputs

- `adapter-class` (required) - string, the `*Adapter` class name from 02
- `port-interface` (required) - string, the port interface the adapter implements

## Outputs

```typescript
// src/runtime/wiring/framework.ts (additions only) — or the wiring module for
// whichever context the new port belongs to
import { WidgetFetcherAdapter } from "../auth/widget-fetcher-adapter.js";

// Inside createDeps:
const widgetFetcher = new WidgetFetcherAdapter(http);
```

## Depends on

- `02-implement-adapter`

## Process

1. Open the wiring module for the adapter's context under `src/runtime/wiring/` (`tools.ts`,
   `translate.ts`, `distribution.ts`, or `framework.ts` — the composition root that assembles
   the other three plus the runtime services).
2. Add an `import` for the new adapter at the top (relative path with `.js`).
3. Instantiate the adapter inside `createDeps`, passing its port-typed dependencies — never concrete adapter types as constructor args.
4. Add the adapter instance to the returned deps object with a camelCase field name matching the port interface name.
5. If the adapter is only needed pre-parse (manifest resolution, prompter), add it to `createMenuDeps` instead. Otherwise use `createDeps`.
6. Never add `new *Adapter()` calls in command files or `cli.ts` — see `.claude/rules/00-architecture/0-deps-wiring.md`.

## Test

Run `pnpm typecheck` — exits 0 confirms the new field type in the deps object matches the port interface exactly.
