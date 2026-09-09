---
objective: "Personne ne télécharge 24 Mo pour une commande qu'il ne voit pas."
status: implemented
---

# Plan : les quatre dépendances que le CLI portait pour le kanban

## La mesure

```
50 paquets, 24,0 Mo installés chez chaque utilisateur d'aidd
   es-toolkit        16,86 Mo   (dépendance d'ink)
   react-reconciler   1,64 Mo
   ink                1,07 Mo
   type-fest          1,06 Mo
   js-yaml            1,00 Mo
```

Pour `aidd kanban` : une commande **cachée**, dont le code dit d'elle-même qu'elle « n'est pas
prête à être proposée aux utilisateurs » et qu'il faut « la démasquer quand sa direction produit
sera tranchée ».

Deux mesures fausses en route, corrigées : mon premier relevé de 1,9 Mo venait d'une résolution
`require.resolve` bloquée par les champs `exports`, et il fallait indexer le magasin `.pnpm` pour
voir l'arbre réel. Le chiffre de 24 Mo, lui, tenait depuis le début.

## Pourquoi les options se réduisaient à une

`optionalDependencies` ne fait rien ici : npm et pnpm les installent par défaut, et ne les sautent
que si l'installation *échoue*. Écarté après vérification, pas avant.

Un paquet publié à part : écarté par le propriétaire du produit.

Un lanceur qui trouve et exécute un binaire — la tâche 1 de la phase 17 du refactor — demande que
kanban ait un point d'entrée. Or `kanban/src/presentation/kanban-deps.ts` dit l'inverse en toutes
lettres : « The kanban source is a folder inside the framework, not a standalone package: it never
reaches for the host's modules itself. » Il reçoit son canal de sortie et son répertoire de docs de
l'hôte qui le monte. Un lanceur demanderait d'inverser ce design : un paquet de plus sans le nom.

Restait : payer, ou débrancher.

## Ce qui est fait

La commande est débranchée. `kanban/` garde son source, ses 68 tests et son `pnpm test:kanban`.
Rebrancher coûte un fichier et quatre lignes de manifeste — mais en respectant l'invariant cette
fois, ce que le source de kanban ne permet pas encore.

Retirées de `cli/package.json` : `ink`, `react`, `cli-table3`, `gray-matter`, et en développement
`@types/react` et `ink-testing-library`. `knip.json` n'ignore plus aucune dépendance — cette
liste d'ignorés existait exactement pour ces quatre.

Le hook `cli-typecheck` n'installe plus les dépendances de `kanban/` : il ne les type-vérifie plus.

`splitting` passe à `false` dans `tsup.config.ts`. Il était à `true` pour que les imports différés
des deux vues du kanban le restent ; ce différé n'existe plus, et la sortie est un seul fichier
dans les deux cas. Le commentaire disait une raison disparue, ce qui est le défaut que cette
session passe son temps à corriger.

## Gains mesurés

| | Avant | Après |
| - | ----: | ----: |
| Paquets installés pour le kanban | 50 | 0 |
| Poids | 24,0 Mo | 0 |
| Paquet construit | 389,8 Ko | 374,8 Ko |

## Ce que ça ouvre, et qui reste à faire

`knip.json` n'ignore plus rien, mais le script CI garde `--exclude exports,types`. Sans cette
exclusion, l'outil signale neuf exports morts qui n'ont rien à voir avec le kanban :

```
marketplaceProbes                   contexts/translate/domain/plugin-format.ts
parseEntryKeys                      kernel/merge.ts
InvalidToolIdError                  kernel/errors.ts
PluginTargetExistsError             kernel/errors.ts
MarketplaceEntryAlreadyExistsError  kernel/errors.ts
AdoptRequiresVersionError           kernel/errors.ts
InvalidCategoryError                kernel/errors.ts
FileDiff (type)                     kernel/file.ts
ConflictDecision (type)             kernel/merge.ts
```

L'exclusion reste donc en place aujourd'hui. La retirer est le prochain geste, une fois ces neuf
tranchés un par un — cinq erreurs typées qui ne sont jamais levées demandent de vérifier qu'aucun
chemin utilisateur ne les attendait.
