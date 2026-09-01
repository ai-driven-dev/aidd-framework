# 01 - Define ToolConfig

Compose the `AiTool<C>` object by intersecting the required `Has*` capability interfaces and
setting the required base fields.

## Inputs

- `tool-name` (required) - string, kebab-case identifier for the new AI tool (e.g. `acme`)
- `capabilities` (required) - list of capability names the tool supports (e.g. `agents`, `skills`, `mcp`)

## Outputs

```typescript
// contexts/tools/domain/profiles/acme/profile.ts
import type { AiTool, HasAgents, HasSkills, UserFileSectionKey } from "../../contracts.js";
import { registerTool } from "../../registry.js";

const DIRECTORY = ".acme/";
const TOOL_SUFFIX = ".acme.md";

export const acme: AiTool<HasAgents & HasSkills> = {
  kind: "ai",
  toolId: "acme",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: `${DIRECTORY}skills/`,
  capabilities: {
    agents: new AgentsCapability({ /* ... */ }),
    skills: new SkillsCapability({ /* ... */ }),
  },
  rewriteContent(content, docsDir) { return content; },
  reverseRewriteContent(content, docsDir) { return content; },
  detectUserFileSectionKey(relativePath) { return null; },
};

registerTool(acme);
```

## Process

1. Create `contexts/tools/domain/profiles/<tool-name>/profile.ts`. Confirm the directory does not already exist. Its build contract (if any) will live alongside it in `build.ts`, added in action 05.
2. Declare module-level constants for `DIRECTORY` and `TOOL_SUFFIX` in `CONSTANT_CASE`.
3. Declare `export const <toolName>: AiTool<Has* & Has* & ...>` — type parameter is the intersection of all required `Has*` interfaces from `contexts/tools/domain/contracts.ts`.
4. Set required fields: `kind: "ai"`, `toolId`, `directory`, `toolSuffix`, `signalDir` (the directory the registry scans for aidd signals; `null` if the tool has no skill signals).
5. For each capability in the list, import its class from `domain/capabilities/` and instantiate it in the `capabilities` object.
6. Add stub implementations for `rewriteContent`, `reverseRewriteContent`, and `detectUserFileSectionKey` — these are completed in 02.
7. Add `registerTool(<toolName>)` at the bottom of the file. Do not call `registerTool` from elsewhere.
8. Use `import type` for type-only imports (`AiTool`, `Has*`, `UserFileSectionKey`); concrete imports for capability classes and `registerTool`.

## Test

Run `pnpm typecheck` — exits 0 confirms the `AiTool<C>` type is correctly assembled and all `Has*` interfaces are satisfied.
