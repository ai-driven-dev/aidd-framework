---
status: done
---

# Phase 5 — Le code mort dans les gardes eux-mêmes

## Quatre morts, chacune d'une nature différente

**Quatre entrées inertes dans `context-boundary`.** Sous la clé `translate` vivaient quatre
chemins `contexts/tools/...`, copies conformes des entrées de `tools`. Jamais consultées : le
lookup est indexé par le contexte du fichier **importé**, donc un fichier de `tools` n'est
comparé qu'à `PUBLIC_MODULES.tools`. Une permission par consommateur n'est pas quelque chose
que ce mécanisme sait exprimer, et ces modules sont publics pour tout le monde de toute façon.

**Cinq branches mortes dans `earned-sharing`.** `areaOf` nommait encore les arbres plats
`application/`, `domain/` et `infrastructure/` que les contextes ont remplacés. Elles ne
correspondaient à rien — **et sa propre sonde était écrite contre deux d'entre elles**, donc
l'exemple de la règle décrivait une disposition disparue. Les retirer cassait la sonde, ce qui
est la preuve qu'elle ne testait plus la règle.

Remplacées par des branches qui couvrent les endroits où un appelant vit réellement, y compris
le domaine et l'infrastructure d'un contexte — sans quoi deux appelants distincts tombaient
tous les deux dans `other` et comptaient pour une seule aire.

**Aucune protection de périmètre vide dans `earned-sharing`.** Trois règles voisines vérifient
que leur sélection n'est pas vide, depuis que l'une d'elles a cessé de s'appliquer en silence
quand son répertoire a bougé. Celle-ci ne le faisait pas, et son périmètre est **un seul
répertoire**. Ajoutée, et sondée en vidant la sélection.

**Un chemin impossible dans la sonde de `context-graph`**, qui affirmait sur
`src/application/commands/ai.ts`. Remplacé par un chemin qui ne prétend pas exister.

## Deux extracteurs d'imports qui se contredisaient

Dans le même répertoire :

```
helpers.ts        /(?:from\s+|import\s+)["'](\.[^"']+)["']/
context-graph.ts  /(?:from|import)\s*\(?\s*["'](\.[^"']+\.js)["']/
```

Le premier exige un espace après `from` ou `import`, donc il rate `import("...")`. Le second
le gère. Et il y en a un vrai dans le code : `presentation/commands/marketplace.ts:181` nomme
`contexts/distribution/domain/catalog.ts` dans une expression de type. Dépendance réelle,
invisible à `context-boundary`, à `earned-sharing` et à tout ce qui repose sur cet extracteur.

Unifié, et l'alias `@/` de `tsconfig.json` est géré aussi — rien ne l'utilise dans `src`
aujourd'hui, mais s'en servir aurait retiré un fichier de la vue de toutes les règles.

**Preuve empirique** plutôt que lecture : `catalog.ts` retiré temporairement de la surface
publique de `distribution`, et `context-boundary` a nommé l'arête
`marketplace.ts -> catalog.ts`. Elle était invisible avant.

## Une erreur de ma part, à consigner

J'ai sondé la protection de périmètre vide puis annulé la sonde avec `git checkout --`, ce qui
a effacé **tout** mon travail non commité sur ce fichier, pas seulement la sonde. Refait, et
les sondes suivantes passent par une copie hors du dépôt.

## Test

`pnpm test:arch` — 50 tests. Chaque suppression a été vérifiée inerte avant retrait, et les
deux ajouts sont sondés.

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2072 tests / 207 fichiers ·
arch 50/50.
