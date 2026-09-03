# Reference: ToolBuildContract — a tool's `aidd translate` behavior

`aidd translate <source> --to <target> --out <dir>` translates the Claude-format framework into
a tool-native plugin tree (`--as marketplace`, the default) or a project workspace
(`--as flat`). A tool's build behavior is declared by **one `ToolBuildContract`**, never by
writing a new strategy class. Two mode-generic orchestrators in `translate` consume it:

- `MarketplaceBuildStrategy(contract)` — emits the tool's marketplace plugin tree + catalog.
- `FlatBuildStrategy(contract)` — materializes content into a project workspace (per-plugin namespace).

Both implement the shared `BuildOutputStrategy` interface and iterate artifact kinds
**generically** — this is the `translate → tools` edge in practice: the orchestrator lives in
`translate`, reads a contract `tools` declared, and contains zero knowledge of any one tool.

## Artifact symmetry (the core rule)

A plugin carries six artifact kinds: `skills`, `agents`, `mcp`, `hooks`, `rules`, `commands`. The
contract exposes ONE `ArtifactContract` per kind — never a kind-specific field (no
`transformAgent`). Each kind is either:

- `{ supported: false }` → warn-and-skip (no native concept in this tool), or
- `{ supported: true, source, path, ext?, transform?, merge?, mergeDest?, mcpServersKey?, hooksMerge?, hooksMergeDest? }`.

The orchestrators contain **zero** `if (tool === …)` and **zero** `if (kind === "agents")`
branches. Adding a tool means writing its contract; adding tool-specific behavior means adding a
field to the contract — never a branch in an orchestrator.

## `ArtifactContract` fields

| Field | Role |
|---|---|
| `source` | where input files come from: `filteredTree` (e.g. agents `.md`), `fullTree` (skills), `configFile` (mcp `.mcp.json`), `hooksBundle` (hooks.json + scripts) |
| `path(plugin, relPath)` | output path for one file — reuse the profile's own `buildInstallPath`; the orchestrator adds the per-plugin namespace in flat mode |
| `ext?` | output extension override (e.g. `.agent.md`, `.toml`); absent means preserve source ext |
| `transform?(content, plugin, basename)` | per-kind content transform; default is identity. Examples: strip `tools`/`color` frontmatter; markdown → TOML |
| `merge?` / `mergeDest?` / `mcpServersKey?` | for config-file kinds (mcp) merging into one shared file rather than a per-plugin write; reuse an existing merge helper, never reimplement |
| `hooksMerge?` / `hooksMergeDest?` | for tools whose hooks register into one shared file rather than a per-plugin write |

Contract-level: `manifestDir` / `marketplaceRelative` / `synthesizeManifest` (marketplace mode;
`null` when the tool has no native marketplace) and an optional `emitConfigArtifact(builtPlugins, outDir)`.

## Reuse, never reinvent

The tool profile already holds the per-tool knowledge — the contract wires it up:

- paths → the capability `buildInstallPath` functions + the generic flat-path primitives in `kernel/materialization/flat-paths.ts`.
- agent format → the tool's existing transform (markdown→TOML formatter, frontmatter-strip helper).
- mcp / config merges → the existing merge helper for that target format; generalize the helper
  (add a parameter) rather than write a parallel one.
- manifest synthesis → the shared Claude-style manifest synthesizer, where the tool adopts that shape.

A helper reused by more than one tool's contract (manifest/catalog shaping shared by
claude+cursor+copilot+codex) does not belong inside any one tool's directory — it lives in
`contexts/tools/domain/marketplace-catalog.ts`, next to `build-contract.ts`.

## MCP namespacing (correctness)

Every flat MCP merge must key-prefix servers by `<plugin>-`. Tools whose MCP config lives at a
primary location (not a per-plugin file) have no isolation otherwise — two plugins declaring a
server of the same name would collide. The prefix is mandatory for every tool.

## Where the contract lives, and how it reaches the pipeline

Each tool's contract(s) live in `contexts/tools/domain/profiles/<tool>/build.ts`, exporting
`build<Tool>Contract()` (marketplace) and/or `build<Tool>FlatContract()` (flat). The profile
declares which modes it supports via `buildContracts: { marketplace?, flat? }` on the `AiTool`
object — a tool with no native marketplace omits `marketplace`.

`runtime/wiring/translate.ts` derives its build registry (the `"<target>:<mode>"` →
`mode-orchestrator(contract)` map) by iterating every registered tool id and reading
`buildContractFor(id, mode)` off its profile — there is no per-tool row to hand-add. A tool with
no `<tool>:marketplace` contract falls through to the existing "Unsupported target/mode" error.
The tool id must still be added to the `FrameworkBuildTarget` union in `translate`, since that
names which targets exist at all, independent of which contracts they declare.
