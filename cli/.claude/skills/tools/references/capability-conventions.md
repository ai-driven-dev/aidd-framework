# Reference: Capability Conventions

## Class shape

```typescript
export class WidgetsCapability {
  readonly widgetsDir: string;
  readonly maxWidgets: number;

  constructor(params: {
    widgetsDir?: string; // optional — has a default
    maxWidgets: number; // required — no default
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
- Throw `CapabilityConfigError` (from `kernel/errors.ts`) on any invalid param combination —
  message format `"<ClassName>: <reason>"`.
- No business logic — the class models configuration, not behavior decisions.
- No imports from a context's `application/` or `infrastructure/`.
- One capability per file: `<kebab-name>-capability.ts` in `domain/capabilities/`. `config-refs.ts` is the one shared helper there, not a capability.

## Has* interface pairing

Every capability class that a tool composes into its `C` type parameter has a matching `Has*`
interface in `contracts.ts`:

```typescript
export interface HasWidgets {
  readonly widgets: WidgetsCapability;
}
```

Field name is the camelCase of the capability name; always `readonly`, never optional — a tool
either includes `Has<Name>` in its intersection or does not carry the field. Import the
capability class with `import type` since `Has*` only uses it as a type. At a call site that
inspects capabilities, guard with `"widgets" in tool.capabilities`, never `instanceof` — the `in`
check is what narrows the type correctly against the `C` intersection.

## Public methods

A capability class may expose derived methods (path builders, resolvers). Each is ≤20 lines and
has no side effects — e.g. `widgetOutputPath(name: string): string`.
