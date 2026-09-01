# Reference: Capability Conventions

## Class shape

```typescript
export class WidgetsCapability {
  readonly widgetsDir: string;
  readonly maxWidgets: number;

  constructor(params: {
    widgetsDir?: string;  // optional — has a default
    maxWidgets: number;   // required — no default
  }) {
    if (params.maxWidgets <= 0) {
      throw new CapabilityConfigError("WidgetsCapability: maxWidgets must be > 0");
    }
    this.widgetsDir = params.widgetsDir ?? DEFAULT_WIDGET_DIR;
    this.maxWidgets = params.maxWidgets;
  }
}
```

## Required invariants

- Class name ends in `Capability`.
- Constructor takes exactly one params object — never positional arguments.
- All public fields are `readonly`.
- Optional params provide defaults via `??` or a module-level `CONSTANT_CASE` constant.
- Throw `CapabilityConfigError` (from `kernel/errors.ts`) on any invalid param combination.
- No business logic — the class models configuration, not behavior decisions.
- No imports from `application/` or `infrastructure/`.

## Module constants

```typescript
const DEFAULT_WIDGET_DIR = ".widgets/";
const MAX_WIDGET_LABEL_LENGTH = 128;
```

Place above the class definition. Use `CONSTANT_CASE`. Never inline literals used more than once.

## File naming

- One capability per file.
- File name: `<kebab-name>-capability.ts` (e.g. `widgets-capability.ts`).
- Location: `domain/capabilities/`.

## Public methods

Capability classes may expose derived methods (path builders, resolvers). Each method must
be ≤20 lines and have no side effects.

Example:
```typescript
widgetOutputPath(widgetName: string): string {
  return `${this.widgetsDir}${widgetName}/`;
}
```

## CapabilityConfigError

Import from `kernel/errors.js`. Throw when constructor params violate a required invariant.
Message format: `"<ClassName>: <reason>"`.

```typescript
import { CapabilityConfigError } from "../errors.js";
// ...
throw new CapabilityConfigError("WidgetsCapability: maxWidgets must be > 0");
```
