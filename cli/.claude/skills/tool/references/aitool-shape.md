# Reference: AiTool Shape

## AiTool<C> — base type

```typescript
interface AiTool<C> {
  readonly kind: "ai";
  readonly toolId: AiToolId;
  readonly directory: string;       // root output directory (e.g. ".acme/")
  readonly toolSuffix: string;      // per-file suffix (e.g. ".acme.md")
  readonly signalDir: string | null; // scanned for `name: aidd:` signals; null = no signals
  readonly requiredIdeIds?: readonly IdeToolId[];
  readonly capabilities: C;
  readonly configOutputPaths?: Readonly<Record<string, string>>;
  rewriteContent(content: string, docsDir: string): string;
  reverseRewriteContent(content: string, docsDir: string): string;
  detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null;
}
```

`C` is always an intersection of `Has*` interfaces (e.g. `HasAgents & HasSkills & HasMcp`).

## Has* interfaces (in contexts/tools/domain/contracts.ts)

| Interface      | Field               | Capability class         |
| -------------- | ------------------- | ------------------------ |
| `HasAgents`    | `agents`            | `AgentsCapability`       |
| `HasSkills`    | `skills`            | `SkillsCapability`       |
| `HasCommands`  | `commands`          | `CommandsCapability`     |
| `HasRules`     | `rules`             | `RulesCapability`        |
| `HasMcp`       | `mcp`               | `McpCapability`          |
| `HasHooks`     | `hooks`             | `HooksCapability`        |
| `HasSettings`  | `settings`          | `SettingsCapability`     |
| `HasPlugins`   | `plugins`           | `PluginsCapability`      |

Include only the `Has*` interfaces the tool actually supports. Unused capability fields must not appear.

## Two config variants

- `AiTool<C>` — AI assistants; `kind: "ai"`; has capabilities
- `IdeToolConfig` — IDE integrations; `kind: "ide"`; no capabilities; `signalDir: null`
- `ToolConfig = AiTool<unknown> | IdeToolConfig` — the union used throughout the registry

## Capability presence guard

```typescript
if ("agents" in tool.capabilities) {
  // tool.capabilities.agents is AgentsCapability
}
```

Use the `in` operator against the capabilities object, never `instanceof`.

## ToolConfig discriminant

```typescript
function isAiTool(config: ToolConfig): config is AiTool<unknown> {
  return config.kind === "ai";
}
```

## registerTool

```typescript
import { registerTool } from "../registry.js";
// At module bottom, after the export const declaration:
registerTool(acme);
```

`registerTool` stores the config in a module-level `Map<ToolId, ToolConfig>`. Call it
exactly once per tool file, at module bottom. Never call it from use-cases, adapters, or commands.

## Agnostic shape example (fictional `acme` tool)

```typescript
// contexts/tools/domain/profiles/acme.ts
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import type { AiTool, HasAgents, HasSkills, UserFileSectionKey } from "../contracts.js";
import { registerTool } from "../registry.js";

const DIRECTORY = ".acme/";
const TOOL_SUFFIX = ".acme.md";

export const acme: AiTool<HasAgents & HasSkills> = {
  kind: "ai",
  toolId: "acme",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: `${DIRECTORY}skills/`,
  capabilities: {
    agents: new AgentsCapability({
      directory: `${DIRECTORY}agents/`,
      toolSuffix: TOOL_SUFFIX,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm,
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => fileName,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm,
    }),
  },
  rewriteContent(content, docsDir) { return content; },
  reverseRewriteContent(content, docsDir) { return content; },
  detectUserFileSectionKey(_relativePath) { return null; },
};

registerTool(acme);
```
