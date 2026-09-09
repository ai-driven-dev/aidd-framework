---
status: done
---

# Instruction: Untangle without moving anything

Four small changes that make every later extraction possible, none of which moves a file. Each was
measured: two design cycles closing through `import type`, six re-export sites, one capability file
mixing two concerns, and one branch re-deriving by name what a profile already declares.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/src/
    ├── domain/
    │   ├── formats/command.ts             ✏️ modify (own the two section types)
    │   ├── tools/contracts.ts             ✏️ modify (import them instead of defining them)
    │   ├── tools/registry.ts              ✏️ modify (stop re-exporting 8 symbols)
    │   ├── capabilities/{rules,commands,skills}-capability.ts  ✏️ modify (import AI_TOOL_IDS from its source)
    │   ├── capabilities/plugins-capability.ts  ✏️ modify (keep PluginsCapability only)
    │   └── capabilities/marketplace-settings.ts  ✅ create (the MarketplaceSettings half)
    └── application/use-cases/
        ├── setup-use-case.ts              ✏️ modify (stop re-exporting SetupToolsResult)
        ├── global/update-all-use-case.ts  ✏️ modify (stop re-exporting GlobalExecutionError)
        └── plugin/translator/built-tree-materialization-translator.ts  ✏️ modify (read mode from the profile)
```

## User Journey

```mermaid
flowchart TD
  A[A file needs a symbol] --> B[It imports it from where it is defined]
  B --> C[No hub, no cycle, no second source of truth]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    the golden net and the architecture ratchets are in place => regressions are visible: 5: system
  section Happy path
    run the whole suite => golden and e2e pass untouched: 5: system
    build and install for every tool => output unchanged: 5: cli
  section Edge case - the opencode branch
    opencode as a target => materialize a plugin => flat mode chosen from the profile, not the name: 1: cli
  section Teardown
    biome reports no re-export => the ratchet for tool names shrank by one: 5: system
```

## Tasks to do

### `1)` Break the two design cycles

> Neither is a runtime cycle: both close through `import type`, which is why `noImportCycles` stays
> silent. They are still two modules that cannot be separated.

1. Move `UserFileSection` and `UserFileSectionKey` out of `tools/contracts.ts` into
   `formats/command.ts`, and have `contracts.ts` import them.
2. Point the three `AI_TOOL_IDS` imports in `capabilities/` at `models/tool-ids.ts`, their source.

### `2)` Remove the six re-exports

1. `registry.ts` re-exports eight symbols it imported from `models/tool-ids.ts`. Delete the
   re-export; consumers import the source.
2. Same for `setup-use-case.ts` and `global/update-all-use-case.ts`.

### `3)` Split the capability that carries two concerns

1. `plugins-capability.ts` holds `PluginsCapability`, used by the five tool profiles, and
   `MarketplaceSettings*`, used only by marketplace settings synchronisation. Move the second half
   to its own file.

### `4)` Read the mode, do not re-derive it

1. Replace `toolId === "opencode" ? "flat" : "marketplace"` in
   `built-tree-materialization-translator.ts` with a read of `mode` on the tool profile.

## Ce qui a bougé par rapport à la projection

Deux fichiers de plus que prévu, tous deux pour la même raison : le critère demandait quelque chose
que rien ne surveillait.

**`domain/tools/registry.ts`** reçoit `frameworkBuildModeFor` au lieu de `plugin-helpers.ts`. La
tâche 4 remplaçait `toolId === "opencode" ? "flat" : "marketplace"` par une lecture du profil, et
cette lecture avait déjà un jumeau exact à cet endroit : `nativeActivationOf`, qui va chercher
`plugins.nativeActivation` dans le profil comme celle-ci va chercher `plugins.mode`. La mettre dans
la couche application l'aurait rendue inaccessible au domaine alors qu'elle ne dépend que de lui.

**`tests/architecture/no-re-export.arch.test.ts`** est nouveau. Le critère 2 nommait Biome comme
juge, mais Biome ne peut pas rendre ce verdict : `noBarrelFile` ne voit que les fichiers qui ne font
que ré-exporter, `noReExportAll` ne voit que `export *`. Or la forme qui s'était accumulée ici est
plus étroite que les deux — `export type { GlobalExecutionError };`, un module qui importe un symbole
et le ré-exporte. Le critère aurait donc été « vérifié » par un outil aveugle à ce qu'il vérifiait,
c'est-à-dire exactement la panne que ce refactor existe pour corriger. Il est devenu un ratchet à
base vide, et il a été éprouvé par injection : ré-introduire un ré-export le fait échouer.

Deux artefacts de la réécriture par script ont aussi été nettoyés : cinq fichiers portaient deux
`import type` du même module après le déplacement des identifiants d'outils, et `knip --production`
reste vide.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1    | `formats/` no longer imports `tools/`, and `capabilities/` no longer imports `tools/registry` |
| 2    | Biome reports no re-export anywhere under `src/` |
| 3    | The five tool profiles import `PluginsCapability` without pulling marketplace settings |
| 4    | Materializing for OpenCode still produces flat output, chosen from the profile; adding a sixth flat tool needs no edit here |
| all  | Golden and e2e pass **unmodified**. This batch moves no file and changes no behavior |
