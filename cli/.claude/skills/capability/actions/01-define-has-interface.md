# 01 - Define Has Interface

Add the `Has*` interface to `contexts/tools/domain/contracts.ts` so that `AiTool<C>` definitions can
include the new capability field in their `C` intersection.

## Inputs

- `capability-name` (required) - string, PascalCase name without the `Capability` suffix (e.g. `Widgets`)
- `class-name` (required) - string, full class name including suffix (e.g. `WidgetsCapability`)

## Outputs

```typescript
// Addition in contexts/tools/domain/contracts.ts
import type { WidgetsCapability } from "../capabilities/widgets-capability.js";

export interface HasWidgets {
  readonly widgets: WidgetsCapability;
}
```

## Process

1. Open `contexts/tools/domain/contracts.ts`.
2. Add `import type { <ClassName> } from "../capabilities/<kebab-name>-capability.js";` in alphabetical order among existing capability imports.
3. Add `export interface Has<CapabilityName> { readonly <camelCaseName>: <ClassName>; }` in alphabetical order among the existing `Has*` interfaces.
4. The field name in the interface is the camelCase capability name (e.g. `HasWidgets` → field `widgets: WidgetsCapability`).
5. Do not add the capability class file yet — that is action 02.

## Test

Run `pnpm typecheck` — exits 0 confirms the new interface compiles and does not break any existing `Has*` intersection.
