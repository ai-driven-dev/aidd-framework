---
objective: "Rien ne subsiste qui soit construit, implémenté ou produit sans que personne ne le lise."
status: implemented
---

# Plan : le code mort que `knip` ne peut pas voir

## L'angle mort, nommé

`pnpm knip` ne signale rien, sans exclusion. Il ne peut pourtant pas voir la forme de mort la
plus courante ici : **un objet construit, une méthode implémentée, un champ produit**. Tous
comptent comme utilisés parce que quelqu'un les écrit. Personne ne vérifie que quelqu'un les
lit.

C'est ainsi que `GitAdapter.installPreCommitDelegate` a survécu à la migration sans jamais
avoir d'appelant, et c'est le même angle mort qui couvre tout ce qui suit.

## Ce qui est mesuré, et comment

**Vingt champs de `Deps` sur soixante-et-un ne sont jamais relus.** Prouvé par suppression :
chaque champ retiré de l'interface **et** du littéral, `tsc` comme juge, dans une copie hors
dépôt.

```
hasher · cliUpdater · platform · authStorage · http · pluginCatalogRepository
pluginFetcher · pluginDistributionReader · marketplaceRegistry · marketplaceTrustStore
pluginAddUseCase · frameworkBuildUseCase · pluginInstallFromMarketplaceUseCase
resolveMarketplaceUseCase · ensureBuiltMarketplaceUseCase · installRuntimeConfigUseCase
installIdeConfigUseCase · pluginPickUseCase · syncConflictResolverUseCase
requireAuthUseCase
```

Ma première exécution disait cinq, et elle était fausse deux fois : le bac à sable n'avait pas
`assets/`, donc `tsc` échouait toujours ; puis ma substitution retirait un argument de
constructeur homonyme au lieu de l'entrée du littéral. Instrument réparé, résultat identique à
celui de la relecture indépendante. **La leçon est de vérifier l'instrument avant la lecture**,
pas de croire un chiffre parce qu'il est sorti d'une commande.

**Quatre méthodes de port implémentées et jamais appelées** : `FileMerger.hasLocalChanges`,
`FileMerger.backup`, `AssetProvider.loadDefaultMarketplace`, `MarketplaceCachePort.list`. Zéro
site d'appel dans `src`.

**Deux méthodes de classe** avec une seule occurrence dans tout le dépôt, leur propre
déclaration : `AgentsCapability.buildUserFilePath`, `BulkConflictState.isSet`.

**Deux champs de contrat que chaque profil remplit et que rien ne lit** :
`ToolBuildContract.manifestDir` et `.marketplaceRelative`, zéro lecture dans `translate`, alors
que les stratégies lisent nommément huit autres champs du même contrat.

**Un invariant déclaré que rien n'applique** : `AiTool.requiredIdeIds`, déclaré une fois,
affecté une fois par le profil copilot, jamais lu. `aidd framework install --tool copilot` sur
un projet sans vscode passe sans rien dire. Ce n'est pas de l'encombrement : c'est une exigence
écrite que personne ne vérifie, et les deux issues — l'appliquer ou la retirer — valent mieux
que le silence.

## Une affirmation de la relecture que je rejette

`AIDD_BUILD_OUT_DIR` serait « écrit et jamais lu ». Il est lu, dans `tsup.config.ts`. Le grep
couvrait `src/`, `tests/` et `scripts/`, pas la racine du paquet. Même erreur de périmètre que
celle que ce dépôt passe la journée à corriger, cette fois du côté de la relecture.

## Phases

| # | Phase | Ce qu'elle ferme |
| - | ----- | ---------------- |
| 1 | Ce que le câblage construit et que personne ne lit | 20 champs, `wireTranslate` |
| 2 | Les ports dont personne n'appelle les méthodes | 4 méthodes, et le sous-arbre que `list` traîne |
| 3 | Ce qui est produit et jamais consommé | 2 champs de contrat, 2 méthodes de classe |
| 4 | L'exigence que personne ne vérifie | `requiredIdeIds` : appliquer ou retirer |
| 5 | Le garde qui rend cet angle mort visible | un port dont une méthode n'a pas d'appelant échoue |

## Ce qui n'est pas dans ce plan

Les treize champs de résultat produits et jamais consommés — `inSync`, `rebuilt`,
`orphanCount`, `totalPluginFilesRestored` et les autres. Les retirer peut être une suppression
de fonctionnalité plutôt qu'un nettoyage : quelqu'un a voulu compter les fichiers restaurés, et
la question de savoir si l'utilisateur devrait les voir n'est pas une question de code mort.
Ils sont listés dans le rapport de cartographie et attendent un arbitrage.
