---
name: tools
description: >
  Defines or modifies what the project targets, under src/contexts/tools/ — an AI/IDE tool
  profile, its build contract, the content-translation capability classes it composes
  (agents/skills/commands/rules/hooks), and its own native-plugin adapter. Use when adding a new
  AI or IDE tool, changing a tool's Has* capability intersection, adding or modifying a
  capability class, or declaring a tool's `aidd translate` build contract. Do NOT use for the
  canonical-to-native translation pipeline itself — use `translate`. Do NOT use for where plugin
  content comes from — use `distribution`. Do NOT use for manifest or install orchestration — use
  `framework`.
---

# Tools

`tools` is what the project targets and how each target is configured. Every AI assistant and
IDE the CLI supports is one `AiTool<C>` or `IdeToolConfig` object in
`contexts/tools/domain/profiles/<tool>/profile.ts`, where `C` is the intersection of `Has*`
capability interfaces the tool actually supports. `translate` depends on `tools` (never the
reverse) to call the tool's own `rewriteContent` and to read its build contract — a tool profile
is data and behavior the rest of the CLI is handed, not a place that reaches out to fetch or
install anything itself.

## What goes in

| Concept | Location |
|---|---|
| A tool's identity, capabilities, content-rewrite | `domain/profiles/<tool>/profile.ts` |
| A tool's `aidd translate` build behavior | `domain/profiles/<tool>/build.ts` (only if the tool is a build target) |
| A string transform used by exactly one profile | that profile's own directory |
| A string transform shared by ≥2 profiles | `domain/formats/` |
| A content-translation capability class (agents/skills/commands/rules/hooks) | `domain/capabilities/` + a `Has*` entry in `contracts.ts` |
| Catalog/manifest shaping shared by ≥2 tools' build contracts | `domain/marketplace-catalog.ts` |
| A port only `tools` needs | `domain/ports/` |
| A tool's own plugin-CLI driver | `infrastructure/` |

## How

- `AiTool<C>` fields: read `domain/contracts.ts`. A list copied here aged at every field.
- `Has*` interfaces live in `contracts.ts`, alphabetical, always `readonly`, never optional —
  a tool either includes `Has<Name>` in its `C` intersection or does not have the field at all.
  Guard presence with `"name" in tool.capabilities`, never `instanceof`.
- `rewriteContent(content)` is one way, per tool, with no reverse and no shared base helper.
  See `references/content-rewrite.md`.
- A capability class ends in `Capability`, takes one params object, all fields `readonly`, throws
  `CapabilityConfigError` (from `kernel/errors.ts`) on an invalid combination, carries no
  application/infrastructure imports. See `references/capability-conventions.md`.
- `PluginsCapability` has three modes (`native`, `flat`, `unsupported`) and a `translationMode`
  (`marketplace` | `flat` | `null`) — see `references/plugins-capability.md`.
- Build behavior is ONE artifact-symmetric `ToolBuildContract` per tool, read by the two
  mode-generic orchestrators (`MarketplaceBuildStrategy`, `FlatBuildStrategy`) in `translate` —
  never a per-tool strategy class, never a per-tool or per-artifact-kind branch in an
  orchestrator. See `references/build-contract.md`.
- `registerTool(config)` is called once, at the bottom of `profile.ts`, never from a use-case.
- Follow the port/adapter rule in `.claude/rules/00-architecture/` for the shape of a port and
  its adapter, and the shared-module rule there before promoting a helper out of a single profile.

## Public surface

Nothing outside `contexts/tools/` may import a module this context has not declared public —
`tests/architecture/context-boundary.arch.test.ts` holds the list (`PUBLIC_MODULES.tools`). A new
module is invisible to `translate` and `framework` until it is added there; there is no
`index.ts` and there never will be (barrels are forbidden by the export rule in
`.claude/rules/01-standards/`).

## How it's tested

- `tests/contexts/tools/` mirrors `src/contexts/tools/` — one profile's `profile.ts`/`build.ts`
  gets a unit test asserting the `AiTool<C>` type is satisfied and each rewrite rule holds.
- `tests/architecture/tool-addition-cost.arch.test.ts` ratchets how many files outside a new
  tool's own directory must change to add it — keep new tool-specific logic inside the profile.
- See the `test` skill for tier conventions; capability/format round-trip tests are unit-tier.
