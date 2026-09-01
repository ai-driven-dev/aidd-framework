---
name: tool
description: >
  Adds or modifies an AI tool definition in contexts/tools/domain/profiles/ and wires its framework-build
  target. Use when defining a new AI assistant tool (composing AiTool<C> from Has* capabilities),
  changing an existing tool's capability intersection, adding or updating content-rewrite logic,
  configuring PluginsCapability with marketplaceSettings, or registering the tool in the registry.
  Do NOT use for adding a new capability class — use `capability` instead. Do NOT use for pure
  string transforms — use `format` instead. Do NOT use for domain type or model changes — use
  `domain-model` instead.
---

# Tool

Builds a complete AI tool definition: a typed object implementing `AiTool<C>` where `C` is an
intersection of `Has*` interfaces sourced from `contexts/tools/domain/contracts.ts`, registered via
`registerTool`, and optionally equipped with `PluginsCapability` and `marketplaceSettings`.

## Available actions

| #   | Action                     | Role                                                     | Input                                   |
| --- | -------------------------- | -------------------------------------------------------- | --------------------------------------- |
| 01  | `define-toolconfig`        | Compose the AiTool<C> object from Has* capabilities      | tool name + required capabilities list  |
| 02  | `content-rewrite`          | Implement lossless rewriteContent / reverseRewriteContent | tool file from 01                      |
| 03  | `plugins-and-marketplace`  | Configure PluginsCapability + marketplaceSettings        | tool file from 01                       |
| 04  | `register-and-test`        | Call registerTool and validate the full definition       | completed tool from 01-03               |
| 05  | `build-contract`           | Declare the tool's `framework build` behavior via `ToolBuildContract` | tool from 01 + modes (marketplace/flat) |

## Default flow

`01 → 02 → 03 → 04` then `05` when the tool must be an `aidd framework build` target.

Skip 03 when the tool has no plugin capability. Skip 02 when the tool reuses base rewrite
helpers without modification (document this explicitly). Skip 05 when the tool is not a
framework-build target.

## Transversal rules

- Tool lives in `contexts/tools/domain/profiles/<tool-name>/`: `profile.ts` (the `AiTool<C>`) plus, when the tool is a framework-build target, `build.ts` (its `ToolBuildContract`(s), declared on `profile.ts` via `buildContracts`).
- `AiTool<C>` where `C` is an intersection of `Has*` interfaces — never a plain object literal without the type annotation.
- Capability presence guard uses `"agents" in tool.capabilities` (in-check), not `instanceof`.
- `rewriteContent` and `reverseRewriteContent` must be exact inverses; compose `baseRewriteContent`/`baseReverseRewriteContent` first, then apply tool-specific transforms.
- `signalDir` points to the directory scanned for `name: aidd:` signals; required and non-null for AI tools.
- `directory` is the root output directory for the tool (e.g. `.acme/`).
- Call `registerTool(config)` at module bottom — never from use-cases or application layer.
- Named export only; no default export.
- `.js` extensions on all relative imports.
- No `any` types.
- Framework-build behavior is declared by ONE artifact-symmetric `ToolBuildContract` (all six
  artifact kinds: skills/agents/mcp/hooks/rules/commands), consumed by the two per-mode
  orchestrators — NEVER a per-tool `*OutputStrategy` class, NEVER a per-tool/per-artifact branch in
  an orchestrator. Unsupported kinds are `{ supported: false }` (warn-and-skip).
- Build contracts reuse existing path/transform/merge helpers; generalize a helper rather than
  reimplement it. Flat MCP merges key-prefix servers by `<plugin>-`.

## References

- `references/aitool-shape.md` — AiTool<C> fields, Has* interfaces, IdeToolConfig, ToolConfig union
- `references/plugins-capability.md` — PluginsCapability constructor params, modes, marketplaceSettings, translationMode, installScope
- `references/content-rewrite.md` — rewriteContent/reverseRewriteContent contract, base helpers, lossless-round-trip requirement
- `references/build-contract.md` — ToolBuildContract + ArtifactContract shape, artifact symmetry, the two per-mode orchestrators, reuse points, registry wiring
