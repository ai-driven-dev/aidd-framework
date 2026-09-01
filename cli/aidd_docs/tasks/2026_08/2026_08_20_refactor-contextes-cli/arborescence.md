# Arborescence cible — CLI orienté contextes

## Graphe

```
presentation ──> contextes ──> kernel
runtime ────────> (câblage uniquement)

framework ──> translate ──> tools ──> kernel
    └───────> distribution ────────> kernel

kanban · telemetry · governance : lancés par le CLI, pas contenus en lui
```

## Arbre

```
cli/src/
  cli.ts

  kernel/                                          ~950   langage commun
    tool.ts                    identité des outils        (ex tool-ids.ts)
    source.ts                  localisation d'une source  (ex plugin-source.ts)
    paths.ts                   chemins projet
    file.ts                    fichier et empreinte
    merge.ts                   stratégies de fusion
    errors.ts                  erreurs de domaine
    ports/  file-reader  file-writer  hasher  logger  asset-provider

  contexts/
    tools/                                        ~2960   ce que le projet cible
      domain/
        profiles/  claude cursor copilot codex opencode vscode
                   chemins, formats natifs, capacités déclarées
        registry.ts  contracts.ts  build-contract.ts
        settings-capability.ts   mcp-capability.ts   config-capability.ts
        mcp-exclusion.ts         tool-recommendations.ts
        ports/  native-plugin-activator  file-merger
      application/
        install-tool  uninstall-tool  install-config
        install-ide-config  install-runtime-config  detect-tools
      infrastructure/
        abstract-native-plugin-cli  codex-cli  copilot-cli

    translate/                                    ~4000   LE CŒUR
      domain/
        capabilities/  agents  skills  commands  rules  hooks
        formats/       markdown  command  placeholders  toml  jsonc
                       chemins par outil, fusions mcp et hooks,
                       réécritures de liens et de tokens
        content-translator.ts
        canon.ts        sections, templates, placeholders  (ex framework.ts)
        build-target.ts cibles et modes                    (ex framework-build.ts)
      application/
        translate-source     source canonique -> natif de N cibles,
                             en place ou vers un arbre de distribution
                             (absorbe l'ancien framework build)
      infrastructure/
        schema-validator

    distribution/                                 ~2400   d'où vient le contenu
      domain/
        marketplace.ts  cache-entry.ts  source-mode.ts
        catalog.ts      catalog-parsers/  (dont copilot natif)
        ports/  registry  cache  trust-store  catalog-repository
                fetcher  raw-fetcher
      application/
        add  list  refresh  register-framework  resolve  fetch-source
        publish-to-registry        (nouveau : publier, pas consommer)
      infrastructure/
        registry  catalog-repository  fetcher  cache  trust  raw-fetcher

    framework/                                    ~4800   ce qui est posé ici
      domain/
        manifest.ts     l'enregistrement, proche d'un lockfile
        plugin.ts       enregistrement installé
        doctor.ts  install-scope.ts  setup-flow.ts  project-context.ts
        semver.ts
        ports/  manifest-repository  plugin-distribution-reader
      application/
        flows/   setup  update  regenerate  sync-settings
                 marketplace-check  marketplace-remove
        cases/   install-plugin  remove-plugin  list  search
                 materialize  status  diagnose  clean  init
      infrastructure/
        manifest-repository  plugin-distribution-reader

  launchers/                                       petit   lance l'écosystème
    kanban.ts       localise et lance le binaire kanban
    telemetry.ts    active, désactive, gère la config (user-scope)
    governance.ts   à venir

  presentation/                                   ~2600
    commands/       enregistrement et parsing par contexte
    display/        rendu des résultats
    prompts/        setup-tools  setup-plugins  plugin-pick  menu
                    conflict-resolution
    output.ts  error-handler.ts

  runtime/                                         ~900
    wiring/         un câblage par contexte, remplace deps.ts (733)
    auth/  http/  git/  platform/  project-root/  self-update/
```

## Invariants

1. `presentation` → contextes → `kernel`. Aucune flèche inverse.
2. Chaîne unique : `framework` → `translate` → `tools` → `kernel`, plus `framework` → `distribution`. Aucune autre arête entre contextes.
3. `kernel` n'importe aucun contexte et ne porte aucune logique métier.
4. Rien n'importe l'intérieur d'un contexte : une importation venue d'ailleurs ne vise qu'un module
   que ce contexte déclare public.

   > La valeur est la frontière, pas le fichier. Un `index.ts` de contexte a d'abord été écrit ici
   > comme mécanisme, avant d'être retiré : c'est un baril de ré-exports, donc il contredit
   > l'invariant 5, la règle Biome `noBarrelFile` et le cliquet `no-re-export` dont la base est vide
   > et éprouvée par injection. La frontière est donc tenue par un cliquet d'architecture qui liste
   > les modules publics de chaque contexte — aucun fichier de ré-export n'existe, donc il n'y a rien
   > à exempter.

5. Aucun barrel de ré-export, nulle part.
6. Un module n'est partagé que s'il a des appelants dans au moins deux contextes.
7. Un chapeau ne dépend pas de plus de contextes qu'il n'en traverse.
8. Deux régimes de propriété, deux traitements :
   - fichiers **possédés** par le CLI (contenu généré, gitignoré) → on régénère, pas de machinerie d'empreinte ;
   - fichiers **co-possédés** avec l'utilisateur (`settings.json`, `.mcp.json`, `.vscode/`) → fusion, diagnostic, conflits.
9. Les lanceurs ne contiennent pas l'applicatif : ils le localisent et l'exécutent.

## Conséquences concrètes du choix « lancé, pas contenu »

- `src/application/commands/kanban.ts` importe aujourd'hui
  `../../../../kanban/src/presentation/...` — un import profond hors du package. Le lanceur
  n'importe plus rien : il localise le binaire et l'exécute.
- `ink` (7.1.1) et `react` (19.2.8) quittent les dépendances de `cli/package.json`. Ils n'y
  servent que kanban, et `knip.json` les liste en `ignoreDependencies` pour cette raison.
  Au passage, les versions divergent déjà : React 19.2.8 côté CLI, 19.2.7 côté kanban.
- `cli-table3` et `gray-matter` sont dans le même cas, à vérifier avant retrait.
- Le budget de `scripts/check-bundle-size.mjs` baisse d'autant ; c'est un gain vérifiable.

## Suppressions actées

- branche catalogues étrangers : `loadForeign()` + 4 parseurs + `normalized-plugin.ts` (code mort, aucun appelant en production)
- `domain/models/marketplace-entry.ts` (103 loc, inatteignable, ignoré par knip.json)
- 4 exports morts de `mcp-exclusion.ts`, `buildMergeFileEntries`, `UpdateAiToolsInput/Result`, `UpdateIdeToolsInput/Result`
- `plugin create` et `plugin-scaffold.ts` (personne n'écrit de plugin tiers)
