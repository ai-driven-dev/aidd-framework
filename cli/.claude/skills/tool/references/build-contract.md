# ToolBuildContract — framework-build behavior per tool

`aidd framework build --target <tool> [--flat]` translates the Claude-format framework into a
tool-native plugin tree (marketplace mode) or a project workspace (flat mode). A tool's build
behavior is declared by **one `ToolBuildContract`**, NOT by writing a new strategy class. Two thin
per-mode orchestrators consume the contract:

- `MarketplaceBuildStrategy(contract)` — emits the tool's marketplace plugin tree + catalog.
- `FlatBuildStrategy(contract)` — materialises content into a project workspace (per-plugin namespace).

Both implement the shared `BuildOutputStrategy` interface and iterate artifact kinds **generically**.

## Artifact symmetry (the core rule)

A plugin carries six artifact kinds: `skills`, `agents`, `mcp`, `hooks`, `rules`, `commands`. The
contract exposes ONE `ArtifactContract` per kind — it never special-cases a single kind (e.g. no
`transformAgent` field). Each kind is either:

- `{ supported: false }` → warn-and-skip (no native concept in this tool; e.g. `rules`/`commands`
  today, or `hooks` for a tool that has no hook capability), or
- `{ supported: true, source, path, ext?, transform?, merge?, mergeDest?, mcpServersKey?,
  hooksMerge?, hooksMergeDest? }`.

The orchestrators contain **zero** `if (tool === …)` and **zero** `if (kind === "agents")` branches.
Adding a tool = writing its contract; adding tool-specific behavior = the contract's fields, never a
branch in an orchestrator.

## `ArtifactContract` fields

| field | role |
| --- | --- |
| `source` | where the input files come from: `filteredTree` (e.g. agents `.md`), `fullTree` (skills), `configFile` (mcp `.mcp.json`), `hooksBundle` (hooks.json + scripts) |
| `path(plugin, relPath)` | output path for one file — reuse the tool def's existing per-capability `buildInstallPath` for the primary-dir path; the orchestrator/contract adds the per-plugin namespace in flat mode |
| `ext?` | output extension override (e.g. `.agent.md`, `.toml`); absent = preserve source ext |
| `transform?(content, plugin, basename)` | per-kind content transform; default = identity (byte-copy). Examples: strip `tools`/`color` frontmatter; markdown → TOML |
| `merge?` / `mergeDest?` / `mcpServersKey?` | for config-file kinds (mcp) that merge into one shared file rather than per-plugin write; reuse an existing merge helper, never reimplement |
| `hooksMerge?` / `hooksMergeDest?` | for tools whose hooks register into one shared file rather than per-plugin write |

Contract-level: `manifestDir` / `marketplaceRelative` / `synthesizeManifest` (marketplace mode;
`null` when the tool has no native marketplace) and an optional `emitConfigArtifact(builtPlugins,
outDir)` (post-build artifact — e.g. a config file that registers skills, or a workspace config).

## Reuse, never reinvent

The tool definition already holds the per-tool knowledge — the contract wires it up:

- paths → the capability `buildInstallPath` functions + the generic flat-path primitives.
- agent format → reuse the tool's existing transform (e.g. a markdown→TOML formatter, a
  frontmatter-strip helper) — do not inline a new one in the contract.
- mcp / config merges → reuse the existing merge helper for that tool's target format; if the
  helper's signature doesn't fit, **generalize the helper** (add a parameter) rather than writing a
  parallel merge.
- manifest synthesis → reuse the shared Claude-style manifest synthesizer where the tool adopts the
  Claude plugin shape.

## MCP namespacing (correctness)

Every flat MCP merge must key-prefix servers by `<plugin>-`. Tools whose MCP config lives at a
primary location (not a per-plugin file) have no isolation otherwise — two plugins declaring a
server of the same name would collide. The prefix is mandatory for all tools.

## Shared vs own contract

When two tools differ only by output directory + a small transform, share **one parameterised
contract factory** (pass the dir prefix + ext). When a tool's format is structurally distinct
(e.g. TOML agents + a config-file registration, or a JSON-config merge with no marketplace), give it
its own contract. This mirrors the layer convention: DRY via a shared factory, isolate genuine
divergence in its own builder — never a base class, never a per-tool branch in the orchestrator.
A helper reused by more than one tool's contract (e.g. manifest/catalog shaping shared by
claude+cursor+copilot+codex) does not belong inside any one tool's own directory — that would make
another tool import across a tool boundary. It lives in
`contexts/tools/domain/marketplace-catalog.ts` instead, next to `build-contract.ts`.

## Where the contract lives, and how it reaches the build pipeline

Each tool's contract(s) live in that tool's own `contexts/tools/domain/profiles/<tool>/build.ts`,
exporting `build<Tool>Contract()` (marketplace) and/or `build<Tool>FlatContract()` (flat). The
tool's `profile.ts` declares which modes it supports by setting `buildContracts: { marketplace?,
flat? }` on the `AiTool` object — a tool with no native marketplace simply omits `marketplace`.

`runtime/wiring/translate.ts` derives its `FRAMEWORK_BUILD_REGISTRY` (the `"<target>:<mode>"` →
`mode-orchestrator(contract)` map) by iterating every registered tool id and reading
`buildContractFor(id, mode)` off its profile — there is no per-tool row to hand-add. A tool with no
`<tool>:marketplace` contract falls through to the existing "Unsupported target/mode" error. The
tool id must still be added to the `FrameworkBuildTarget` union and the command's
`SUPPORTED_TARGETS`, since those name which targets exist at all, independent of build contracts.
