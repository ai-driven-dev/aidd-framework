---
status: done
---

# Phase 1 — Le contexte que la frontière ne regardait pas

## Le défaut

`context-boundary.arch.test.ts` porte cette ligne :

```ts
if (owner === null || !(owner in publicModules)) continue;
```

`PUBLIC_MODULES` avait trois clés — `tools`, `translate`, `distribution` — et quatre contextes
existent sur disque. Tout fichier de `framework` était donc sauté **avant** toute vérification.
Non pas autorisé : jamais regardé.

Le fichier annonçait sa propre lacune dans son commentaire d'en-tête : la liste devait grandir
« as `framework` and `distribution` are extracted ». Seul `distribution` l'a été.

## Mesure

Quinze imports atteignaient l'intérieur de `framework`, treize modules distincts, racine de
composition exclue. Sonde de la relecture : un import vers un module profond de `framework`
passe le test ; le même geste vers l'un des trois autres contextes échoue.

## Ce qui est fait

**La surface publique de `framework` est déclarée**, douze modules groupés par rôle comme les
trois autres : le relevé d'installation qu'il possède, les flux qu'une commande pilote, ce
qu'un affichage ou une invite lit pour rendre une décision qu'il ne prend pas, et l'unique
opération qu'un autre contexte demande vraiment.

**Un méta-contrôle empêche la lacune de se reformer** : chaque répertoire sous `src/contexts/`
doit avoir son entrée. Sans lui, créer un cinquième contexte le laisserait libre par défaut,
silencieusement — c'est le geste que `import-rules-bite` fait déjà pour biome, appliqué ici.

Il vient avec sa propre sonde, qui documente le mode de défaillance plutôt que de l'affirmer :
un contexte non déclaré produit zéro violation, le même déclaré avec une surface vide en
produit une.

## Ce que la clôture a révélé, et qui n'était pas un problème de garde

Deux imports restaient en violation après la déclaration :
`runtime/self-update/{check-update,self-update}-use-case.ts → framework/domain/semver.ts`.

Les déclarer publics aurait écrit un mensonge dans la clôture : comparer des versions n'a rien
à voir avec le relevé d'installation. Mesuré : 18 lignes, aucun import, quatre lecteurs — deux
dans `framework`, deux dans `runtime`. C'est du vocabulaire parlé par deux aires, exactement la
règle d'appartenance au noyau que `scope.ts` et `merge.ts` satisfont déjà.

`semver.ts` rejoint donc `kernel/`. Le noyau passe de 9 à 10 fichiers directs, à la limite et
sous elle.

Au passage, ma première liste de lecteurs en comptait deux et il y en avait quatre : je grepais
`domain/semver.js`, ce qui rate `../semver.js`. La même erreur de périmètre que ce plan
corrige, commise en le corrigeant.

## Test

`pnpm test:arch` — 41 tests, dont le méta-contrôle et sa sonde. La clôture de `framework` mord :
avant le déplacement de `semver.ts`, elle nommait les deux imports fautifs.

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2063 tests / 207 fichiers ·
arch 41/41 · 9 cellules golden identiques · smoke 98/0, 22/22.
