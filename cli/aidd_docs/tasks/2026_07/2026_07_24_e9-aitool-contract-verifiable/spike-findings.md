# SPIKE-E9-01 — audit of remaining parallel lists (findings)

Re-verified against the current `framework/cli` tree (post-migration, post-#514), not trusted from the original cartography.

## Confirmed derivation targets

### 1. `domain/models/plugin-format.ts` — two probe tables, zero imports

```ts
export type PluginFormat = "claude" | "cursor" | "codex" | "copilot" | "opencode";

export const PLUGIN_MANIFEST_PROBES = [
  { format: "claude",   relativePath: ".claude-plugin/plugin.json" },
  { format: "cursor",   relativePath: ".cursor-plugin/plugin.json" },
  { format: "codex",    relativePath: ".codex-plugin/plugin.json" },
  { format: "copilot",  relativePath: ".plugin/plugin.json" },
  { format: "copilot",  relativePath: ".github/plugin/plugin.json" },
  { format: "copilot",  relativePath: "plugin.json" },
];

export const MARKETPLACE_PROBES = [
  { format: "claude",   relativePath: ".claude-plugin/marketplace.json" },
  { format: "cursor",   relativePath: ".cursor-plugin/marketplace.json" },
  { format: "codex",    relativePath: ".agents/plugins/marketplace.json" },
  { format: "copilot",  relativePath: ".github/plugin/plugin.json" },
  { format: "opencode", relativePath: "opencode.json" },
];
```

Consumers: `PluginDistributionReaderAdapter:15,36` (manifest probes), `PluginCatalogRepositoryAdapter:11,37` (marketplace probes).

**Not a 1:1 tool mapping** — copilot has 3 manifest probe paths, 1 marketplace probe. Any derivation must be one-tool→many-paths, not one-tool→one-path.

**Noted, not fixed here**: `MARKETPLACE_PROBES`'s copilot entry points at `.github/plugin/plugin.json` — a *manifest* filename in the *marketplace* table, and byte-identical to a `PLUGIN_MANIFEST_PROBES` entry. Either intentional (copilot's marketplace is its manifest) or a latent copy-paste bug. Out of scope for E9; flagged for separate triage.

### 2. `infrastructure/adapters/plugin-catalog-repository-adapter.ts` — two dispatch sites, not one

- `loadForeign()` (lines 36-47): the if/else chain the ticket names. Each branch calls a **different domain parser** (`parseCursorMarketplace`, `parseCodexMarketplace`, `parseCopilotMarketplace`, `parseOpencodeMarketplace`) returning `NormalizedPlugin[]`.
- `load()` (lines 24-34): a **separate** hardcoded two-path sequence the ticket never mentions — `COPILOT_MARKETPLACE_PATH` (`.plugin/marketplace.json`) checked first, then `CLAUDE_MARKETPLACE_PATH`, with its own module constants and order significance. Note `.plugin/marketplace.json` here is a *fourth* distinct path string, in neither probe table.

Deriving `loadForeign`'s dispatch means a tool file must carry a **function reference** (its parser) — architecturally legal (domain→domain) but a new kind of thing in a contract that is otherwise pure data.

### 3. `domain/models/plugin-content-translator.ts:22-27` — a third manifest-path list

```ts
const PLUGIN_MANIFEST_PATHS: readonly string[] = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "plugin.json",
];
```

Not in the original cartography. Used at line 136 to skip manifest files during translation. **Already diverged** from `PLUGIN_MANIFEST_PROBES`: missing copilot's `.plugin/plugin.json` and `.github/plugin/plugin.json`. Whether that divergence is intentional (translation-time vs detection-time concerns) or a bug is unverified — it is exactly the class of silent drift E9 exists to prevent.

## Explicit non-targets

- **`HooksContentFormat = "claude" | "cursor"`** (`domain/formats/cursor-hooks.ts:1`), referenced by `PluginsCapability.hooksContentFormat`. Legitimately narrower than the tool set — only two hook *wire formats* exist, and several tools share one. Do **not** try to unify this with `AiToolId` in a future ticket.
- **`FrameworkBuildTarget`** — already handled by E2-US02 (#514): the canonical list now lives in `domain/models/framework-build.ts` with a registry drift-guard test.
- **`--help` description strings** (`framework.ts:23`, `ai.ts:21`) hardcode the five names in prose. Cosmetic, goes stale when tool #6 lands. Known, low severity, decide separately.

## The distinction the tickets did not model

`PluginFormat` and `AiToolId` have the same five members **today**, but mean different things:
- `AiToolId` — a tool aidd installs *into*.
- `PluginFormat` — a native on-disk layout aidd can *read*, written by some other tool.

Their coincidence is what makes derivation look trivial and is exactly what would make it fragile. A tool aidd supports need not have an ingestible foreign format, and one format can have several paths (copilot).

## Blocking hazard for any derivation approach

`plugin-format.ts` is currently a **zero-import pure-data module**. `getAllRegisteredTools()` reads a `Map` populated by *side-effect imports* (`import "../domain/tools/ai/claude.js"` etc., in `deps.ts` and `tests/helpers/ports/build-unit-deps.ts`).

Making `PLUGIN_MANIFEST_PROBES` a module-level `const` derived from that registry would **snapshot whatever is registered at first import** — an empty or partial table depending on module import order, in exactly the test paths that construct adapters directly rather than through `deps.ts`. `tsc` and a fully green suite would not catch it.

If derivation is chosen, the probes must become a **function evaluated at call time** (both consumers already use them inside an async method's `for` loop, so this is free), never a module-level const. This must be decided in the plan, not discovered in implementation.
