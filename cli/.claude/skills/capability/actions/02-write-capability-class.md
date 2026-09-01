# 02 - Write Capability Class

Create the capability class file with its constructor params object, readonly public fields,
and any derived public methods the tool layer needs.

## Inputs

- `capability-name` (required) - string, PascalCase name including the `Capability` suffix (e.g. `WidgetsCapability`)
- `params` (required) - list of constructor parameter names and types
- `methods` (optional) - list of public method names and signatures needed by tool files

## Outputs

```typescript
// domain/capabilities/widgets-capability.ts
import { CapabilityConfigError } from "../errors.js";

const DEFAULT_WIDGET_DIR = ".widgets/";

export class WidgetsCapability {
  readonly widgetsDir: string;
  readonly maxWidgets: number;

  constructor(params: {
    widgetsDir?: string;
    maxWidgets: number;
  }) {
    if (params.maxWidgets <= 0) {
      throw new CapabilityConfigError("WidgetsCapability: maxWidgets must be > 0");
    }
    this.widgetsDir = params.widgetsDir ?? DEFAULT_WIDGET_DIR;
    this.maxWidgets = params.maxWidgets;
  }

  widgetOutputPath(widgetName: string): string {
    return `${this.widgetsDir}${widgetName}/`;
  }
}
```

## Depends on

- `01-define-has-interface`

## Process

1. Create `domain/capabilities/<kebab-name>-capability.ts`. Confirm it does not already exist.
2. Declare module-level constants in `CONSTANT_CASE` for any default values or repeated literals.
3. Export the class with the `Capability` suffix. No default export.
4. Constructor takes a single params object (never positional arguments).
5. For each optional param, provide a sensible default via the `??` operator or a module constant.
6. Validate required invariants in the constructor body; throw `CapabilityConfigError` (imported from `kernel/errors.js`) on invalid input.
7. All public fields are `readonly`; assign them from the params object in the constructor.
8. Declare any derived public methods needed by tool files (≤20 lines each).
9. No imports from `application/` or `infrastructure/`.

## Test

Run `pnpm typecheck` — exits 0 and `pnpm lint` exits 0 confirming the class compiles, satisfies the `Has*` field type, and passes lint.
