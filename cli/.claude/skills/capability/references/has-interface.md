# Reference: Has* Interface

## Location and placement

All `Has*` interfaces live in `contexts/tools/domain/contracts.ts`. They are placed in alphabetical order
among the existing interfaces. The `Has*` interfaces make up the `C` type parameter of `AiTool<C>`.

## Naming rule

- Interface name: `Has<CapabilityName>` (e.g. `HasWidgets`, `HasAgents`, `HasPlugins`).
- Field name: camelCase of the capability name (e.g. `HasWidgets` → `widgets`).
- Field type: the capability class (e.g. `WidgetsCapability`).

## Shape

```typescript
export interface HasWidgets {
  readonly widgets: WidgetsCapability;
}
```

Always `readonly`. Never optional (`?:` is not allowed on `Has*` fields — a tool either has
the capability or does not include `Has<Name>` in its `C` intersection).

## Import rule

The capability class is imported with `import type` because it is used only as a type:

```typescript
import type { WidgetsCapability } from "../capabilities/widgets-capability.js";
```

## Capability presence guard

At call sites that inspect a tool's capabilities, use the `in` operator:

```typescript
if ("widgets" in tool.capabilities) {
  // tool.capabilities.widgets is WidgetsCapability
  const dir = tool.capabilities.widgets.widgetsDir;
}
```

Never use `instanceof`. The `in` check narrows the TypeScript type correctly when the
`Has*` interface is part of the `C` intersection.

## Existing Has* interfaces (as of current contracts.ts)

| Interface     | Field      | Capability class        |
| ------------- | ---------- | ----------------------- |
| `HasAgents`   | `agents`   | `AgentsCapability`      |
| `HasCommands` | `commands` | `CommandsCapability`    |
| `HasHooks`    | `hooks`    | `HooksCapability`       |
| `HasMcp`      | `mcp`      | `McpCapability`         |
| `HasPlugins`  | `plugins`  | `PluginsCapability`     |
| `HasRules`    | `rules`    | `RulesCapability`       |
| `HasSettings` | `settings` | `SettingsCapability`    |
| `HasSkills`   | `skills`   | `SkillsCapability`      |

New `Has*` interfaces are added in this alphabetical order.
