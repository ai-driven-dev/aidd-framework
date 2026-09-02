# 05 - Build Contract

Declare the tool's `aidd framework build` behavior by implementing one artifact-symmetric
`ToolBuildContract` and registering its `(target, mode)` rows. Do this when a tool must be a
framework-build target (marketplace and/or flat). Never write a new `*OutputStrategy` class — that
pattern is gone; the two per-mode orchestrators consume the contract.

## Inputs

- `tool-name` (required) - kebab-case tool name matching the file from 01
- `modes` (required) - which modes the tool supports: `marketplace`, `flat`, or both. A tool with no
  native marketplace supports `flat` only.

## Depends on

- `01-define-toolconfig` (the tool's capabilities + `buildInstallPath` functions are the contract's path source)

## Outputs

```
Build-contract checklist:
  - [ ] contract declares ALL six artifact kinds (skills/agents/mcp/hooks/rules/commands)
        as ArtifactContract | { supported: false } — no kind omitted, no agent special-casing
  - [ ] paths reuse the tool's buildInstallPath / generic flat-path primitives (no inline reinvention)
  - [ ] transforms + merges reuse existing helpers (generalize, never reimplement)
  - [ ] flat mcp merge key-prefixes servers by "<plugin>-"
  - [ ] each `build<Tool><Mode>Contract()` lives in the tool's own `build.ts`, declared on
        `profile.ts` via `buildContracts: { marketplace?, flat? }` — unsupported modes simply absent
  - [ ] tool id in FrameworkBuildTarget union + command SUPPORTED_TARGETS
  - [ ] orchestrators still contain zero per-tool / per-artifact branches
```

## Process

1. Read `references/build-contract.md` for the contract shape and rules.
2. Decide each artifact kind: `{ supported: false }` for kinds the tool has no native concept for
   (today: `rules`, `commands` for all tools; `hooks` for a tool with no hook capability), else a
   `{ supported: true, ... }` with `source` + `path` + (only as needed) `ext`/`transform`/`merge`.
3. For `path`, reuse the tool's per-capability `buildInstallPath` and the generic flat-path
   primitives — pass the tool's dir prefix + ext; do not inline a new path string.
4. For `transform`, reuse the tool's existing format helper (frontmatter strip, markdown→TOML, …).
   For `merge` (mcp/config targets), reuse the existing merge helper; if its signature does not fit,
   generalize the helper with a parameter rather than writing a parallel merge. Key-prefix mcp
   servers by `<plugin>-`.
5. If the tool needs a post-build artifact (a config file that registers skills, a workspace
   config), implement `emitConfigArtifact`; otherwise omit it.
6. If two tools differ only by dir prefix + a small transform, factor a single parameterised
   contract factory; isolate a structurally distinct tool in its own builder. Content or
   catalog-shaping logic genuinely shared across tools (not just this one) belongs in
   `contexts/tools/domain/marketplace-catalog.ts`, never in one tool's own directory imported by
   another's.
7. Write the contract(s) in `contexts/tools/domain/profiles/<tool-name>/build.ts`, exporting
   `build<Tool>Contract()` and/or `build<Tool>FlatContract()`. In `profile.ts`, add
   `buildContracts: { marketplace: build<Tool>Contract, flat: build<Tool>FlatContract }` (omit
   whichever mode the tool does not support) to the `AiTool` object. `runtime/wiring/translate.ts`
   derives its framework-build registry from every registered profile's `buildContracts` —
   nothing to add there. Add the tool id to the `FrameworkBuildTarget` union and the command's
   `SUPPORTED_TARGETS`.

## Test

- `aidd framework build --target <tool> [--flat] --out <dir>` exits 0 and produces the tool's
  documented native layout (verify against the tool's own docs — skills/agents/mcp/hooks paths,
  agent format, config file). For flat, `--out` must be an existing directory.
- Smoke in `/tmp` (never the repo root): build into a fresh `/tmp/<name>`, assert the tree matches
  the documented format (e.g. valid TOML / valid JSON config where applicable) and mcp servers are
  `<plugin>-`-prefixed.
- Grep gate: zero `if (tool === …)` and zero `if (kind === "agents")` in the two orchestrators.
- Existing targets' output stays byte-identical (regression — compare against a pre-change baseline,
  not a freshly regenerated snapshot).
