# Reference: Discriminant Types

## Rules

- Every discriminant string union used in ≥2 use-cases → named type in `src/domain/models/`
- Never inline `type Foo = "a" | "b"` in use-case files
- Register newly created discriminant types in the project's canonical location table (maintained in `references/discriminant-types.md` for the active project) so future contributors know where to import from

## Naming

- Type name: `PascalCase`
- File name: `kebab-case.ts` matching the concept — `widget-mode.ts` for `WidgetMode`

## Pattern (agnostic example)

Bad — inline union duplicated across two use-cases:

```typescript
// apply-widget-use-case.ts
type WidgetMode = "sync" | "push" | "dry-run";

// remove-widget-use-case.ts
type WidgetMode = "sync" | "push" | "dry-run"; // duplicated!
```

Good — a single named export, in the module named after the concept:

```typescript
// src/domain/models/widget-mode.ts
export type WidgetMode = "sync" | "push" | "dry-run";
export const WIDGET_MODE_VALUES = ["sync", "push", "dry-run"] as const;
```

Both use-cases import from the canonical path:

```typescript
import type { WidgetMode } from "../../domain/models/widget-mode.js";
```
