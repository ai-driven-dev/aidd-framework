---
status: pending
---

# Instruction: Extract the tools context

What the project targets, and how each target is configured. This is the phase that settles the
plan's acceptance test: adding a sixth tool must touch one file.

Today it touches eight, and three of them are parallel unions of the same five values. Measured:
`AiToolId`, `PluginFormat` and `FrameworkBuildTarget` have exactly the same members, in different
order, with nothing checking that they agree.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/src/contexts/tools/          ✅ create
    ├── domain/
    │   ├── profiles/                ✅ create (claude, cursor, copilot, codex, opencode, vscode)
    │   ├── registry.ts              ✏️ modify (from domain/tools/)
    │   ├── contracts.ts             ✏️ modify (from domain/tools/)
    │   ├── settings-capability.ts   ✏️ modify (co-owned files)
    │   ├── mcp-capability.ts        ✏️ modify (co-owned files)
    │   ├── mcp-exclusion.ts         ✏️ modify (from domain/models/)
    │   └── ports/                   ✅ create (native-plugin-activator, file-merger)
    ├── application/                 ✏️ modify (install-tool, uninstall-tool, the three config installs)
    └── infrastructure/              ✏️ modify (native-plugin-cli, codex-cli, copilot-cli)

cli/src/application/use-cases/framework/strategies/tool-contracts.ts  ❌ delete (820 l., split across profiles)
cli/src/domain/models/plugin-format.ts        ✏️ modify (becomes derived)
cli/src/domain/models/framework-build.ts      ✏️ modify (keeps only the mode type)
```

> **Frontière sans baril (tranché en phase 7).** Ce contexte n'a pas d'`index.ts`. La valeur de
> l'invariant est « rien n'importe l'intérieur d'un contexte », et un fichier de ré-exports n'est
> qu'un mécanisme — celui-là contredit `noBarrelFile` et le cliquet `no-re-export` à base vide. La
> frontière est tenue par un cliquet d'architecture qui liste les modules publics du contexte : une
> importation venue d'un autre contexte ne vise que cette liste. Voir `arborescence.md`, invariant 4.

## User Journey

```mermaid
flowchart TD
  A[A sixth tool is supported] --> B[One profile file is written]
  B --> C[It declares paths, formats, capabilities and its build contract]
  C --> D[One registration line]
  D --> E[Nothing else is edited]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    the tool-addition-cost ratchet lists twenty files => the target is measurable: 5: system
  section Happy path
    install and uninstall each supported tool => unchanged behavior: 5: cli
    build for each surviving target => output byte-identical: 5: cli
    merge settings and mcp into a project that already has its own => user entries preserved: 5: cli
  section Edge case - a seventh tool, on paper
    add a profile in a scratch branch => nothing outside it needs an edit => the ratchet stays empty: 1: system
  section Teardown
    the three parallel unions are gone => one source, two derived types: 5: system
```

## Tasks to do

### `1)` Give each profile its build contract

1. `tool-contracts.ts` holds nine `build*Contract()` functions for five tools. A tool's build
   contract is a property of that tool: move each into its profile.
2. The 820-line file disappears.

### `2)` Derive the unions

1. `PluginFormat` and `FrameworkBuildTarget` have the same members as `AiToolId`. Make them aliases
   or explicit subsets so the values are written once.
2. `FRAMEWORK_BUILD_TARGET_MODES` becomes derived: each profile declares its mode, since phase 5
   made the mode a property of the tool.

### `3)` Move the co-owned configuration

1. `settings-capability`, `mcp-capability` and `mcp-exclusion` describe files the user also owns.
   They belong here, with the merge strategies that keep the user's entries.

### `4)` Close the context

1. Declare the context's public modules in the boundary ratchet, and add the biome `override` refusing imports into the interior.
2. Shrink the `tool-addition-cost` baseline to empty, or record what is left and why.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1    | Building for each surviving target produces the same tree; no file outside the profiles names a tool |
| 2    | Changing the tool list in one place is enough; the derived types follow without a second edit |
| 3    | Installing into a project that already has its own `settings.json` and `.mcp.json` preserves the user's entries |
| 4    | An import into `contexts/tools/` interior fails the lint; the `tool-addition-cost` baseline is empty or justified line by line |
| all  | Golden, build golden and e2e pass **unmodified** |
