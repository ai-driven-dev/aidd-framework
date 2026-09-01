# 03 - Wire Into Tool

Add the new capability to an existing `AiTool<C>` definition by updating its type parameter
and instantiating the class in the `capabilities` object.

## Inputs

- `tool-name` (required) - string, kebab-case name of the target tool (e.g. `acme`)
- `capability-class` (required) - string, full class name (e.g. `WidgetsCapability`)
- `has-interface` (required) - string, the `Has*` interface name (e.g. `HasWidgets`)

## Depends on

- `02-write-capability-class`

## Outputs

```typescript
// contexts/tools/domain/profiles/acme.ts — diff
import { WidgetsCapability } from "../../capabilities/widgets-capability.js";
import type { ..., HasWidgets } from "../contracts.js";

export const acme: AiTool<HasAgents & HasSkills & HasWidgets> = {
  // ...
  capabilities: {
    agents: new AgentsCapability({ ... }),
    skills: new SkillsCapability({ ... }),
    widgets: new WidgetsCapability({ maxWidgets: 50 }),
  },
};
```

## Process

1. Open `contexts/tools/domain/profiles/<tool-name>.ts`.
2. Add `import { <CapabilityClass> } from "../../capabilities/<kebab-name>-capability.js";` in alphabetical order.
3. Add `HasWidgets` (or the appropriate `Has*` name) to the `AiTool<C>` type parameter intersection.
4. Add the new field to the `capabilities` object with `<camelCaseName>: new <CapabilityClass>({ ... })`.
5. Confirm the capability presence guard in any use-site that inspects capabilities uses the `in` operator: `"widgets" in tool.capabilities`.

## Test

Run `pnpm typecheck` — exits 0 confirms the tool's `C` intersection is satisfied and the new capability field is type-correct.
