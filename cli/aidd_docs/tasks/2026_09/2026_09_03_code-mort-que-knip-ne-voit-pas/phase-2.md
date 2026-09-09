---
status: done
---

# Phase 2 — Les ports dont personne n'appelle les méthodes

## Quatre méthodes, zéro appelant, quatre vérifications

Un port déclare, un adaptateur implémente : `knip` voit les deux et conclut à l'usage. Personne
ne vérifie qu'un appelant existe. Chacune des quatre a été vérifiée avant suppression, parce
que retirer une capacité que l'outil est seul à offrir serait une perte et non un nettoyage.

**`FileMerger.hasLocalChanges`** — « ce fichier a-t-il dérivé de son hash enregistré ». La
dérive est bien détectée, ailleurs et autrement : `detect-plugin-drift-use-case.ts` compare
`readFileHash` au hash attendu directement. La méthode dupliquait cette logique sans appelant.

**`FileMerger.backup`** — écrit une copie `.bak.<horodatage>`. Rien dans `src` ne l'appelle, et
aucun texte destiné à l'utilisateur ne promet de sauvegarde. `status-use-case.ts` portait un
commentaire disant que le CLI écrit des fichiers `.backup` « exprès » : doublement faux, rien ne
les écrit et la méthode produisait un autre suffixe. Le saut de ces fichiers dans le scan reste
— il épargne ce qu'une version plus ancienne aurait laissé — mais le commentaire dit maintenant
ce qui est vrai.

**`AssetProvider.loadDefaultMarketplace`** — coûtait plus qu'une méthode : il embarquait
`assets/marketplaces/default.json` dans le binaire, fichier qui duplique deux constantes du
code. L'enregistrement du marketplace du framework se fait dans
`MarketplaceRegisterFrameworkUseCase`, qui dérive sa source lui-même et ne lit ni l'asset ni le
port.

**`MarketplaceCachePort.list`** — traînait un sous-arbre : `buildEntry`, `computeSize`,
`readLastFetchedAt`, l'entité `MarketplaceCacheEntry` avec son `equals()`, son type de
paramètres, et `EmptyMarketplaceCacheNameError`. Le port se réduit à `clear`, sa seule opération
appelée, par `marketplace refresh --force`.

Il lisait aussi `.fetch-meta.json`, **un fichier que rien dans le dépôt n'écrit** — seuls les
tests le créaient pour éprouver la lecture. `lastFetchedAt` était donc structurellement toujours
nul en usage réel : un champ dont la valeur ne pouvait pas exister.

## Ce que ça retire

```
2 méthodes de port + leurs implémentations et bouchons
1 entité de domaine et son erreur
1 asset embarqué dans le binaire
21 tests qui n'éprouvaient plus que du code supprimé
```

Paquet construit : 373,6 → **371,6 Ko**.

## Test

Gates : tsc propre · lint 506 fichiers 0 warning · knip propre · 2051 tests / 206 fichiers ·
arch 51/51 · couverture 93,77 % · paquet 371,6 Ko · 9 cellules golden identiques ·
smoke 98/0, 22/22.

Le garde des chemins cités a nommé une ligne de `memory/architecture.md` décrivant l'entité
supprimée, dans la même exécution. C'est le second garde de la journée à attraper une
conséquence que je n'avais pas cherchée.
