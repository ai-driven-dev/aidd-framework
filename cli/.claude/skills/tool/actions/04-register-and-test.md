# 04 - Register and Test

Verify that `registerTool` is called correctly, the tool resolves from the registry, and
the full definition satisfies all type constraints.

## Inputs

- `tool-name` (required) - string, kebab-case tool name matching the file from 01
- `tool-id` (required) - string, the `AiToolId` registered for this tool

## Depends on

- `01-define-toolconfig`
- `02-content-rewrite`
- `03-plugins-and-marketplace` (if applicable)

## Outputs

```
Validation checklist:
  - [ ] registerTool(acme) present at module bottom
  - [ ] toolId is declared in kernel/tool.ts AI_TOOL_IDS
  - [ ] pnpm typecheck exits 0
  - [ ] pnpm build exits 0
  - [ ] pnpm lint exits 0
```

## Process

1. Confirm `registerTool(<toolName>)` is the last statement in the module (after the `export const` declaration).
2. Confirm `toolId` is a valid member of `AI_TOOL_IDS` in `kernel/tool.ts`. If not, add it to the array in that file first.
3. Confirm the tool file imports `registerTool` from `contexts/tools/domain/registry.js` (not re-exported from elsewhere).
4. Run the validation checklist in order: typecheck, then build, then lint. Fix any failures before moving on.
5. Write a unit test in `tests/contexts/tools/domain/` that calls `getToolConfig("<tool-id>")` and asserts the returned config is not undefined and `config.kind === "ai"`.

## Test

Run `pnpm typecheck && pnpm build && pnpm lint` — all exit 0, confirming the tool definition compiles, bundles, and passes style checks.
