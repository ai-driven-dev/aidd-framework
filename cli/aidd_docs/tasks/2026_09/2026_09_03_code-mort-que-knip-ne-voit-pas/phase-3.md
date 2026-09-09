---
status: done
---

# Phase 3 — Ce qui est produit et jamais consommé

## Deux champs de contrat que chaque profil remplissait

`ToolBuildContract.manifestDir` et `.marketplaceRelative`. La preuve n'est pas une absence,
c'est un contraste : les stratégies de construction lisent nommément huit autres champs du même
contrat — `synthesizeManifest`, `manifestFileRelative`, `manifestSchemaName`, `pluginRootToken`,
`artifacts`, `buildMarketplaceCatalog`, `buildMarketplaceEntry`, `emitConfigArtifact`. Ces deux
là, zéro lecture.

Et chaque profil les payait. Pire, quatre profils calculent un `marketplaceRelative` local,
l'utilisent pour un vrai `destRelPath`, **puis** le repassent dans un champ que personne ne
relit : la même valeur écrite deux fois, dont une pour rien.

## Un champ qui documentait son propre vide

`SynthesizeClaudeStyleManifestOpts.manifestDir` portait ce commentaire :

> Output manifest subdirectory name. **Reserved for caller/future divergence.**

Réservé pour un avenir qui n'est pas venu, passé par trois profils, lu par personne. La
fonction qui le reçoit ne le touche pas.

## Deux méthodes de classe

`AgentsCapability.buildUserFilePath` — neuf lignes de construction de chemin avec une branche
sur `userFileExt`, une seule occurrence dans tout le dépôt : sa déclaration.

`BulkConflictState.isSet()` — redondante avec `get()`, qui renvoie déjà `null` quand rien n'est
posé.

## Une observation, pas une action

`userFileExt` survit à la suppression de `buildUserFilePath` : le profil copilot le pose, et
`equals()` le compare. Son seul consommateur est donc une comparaison d'égalité — il n'influence
plus aucun comportement. Et cet `equals()` n'est appelé que par des tests, comme celui de toutes
les autres capacités. C'est le même défaut de forme, à une échelle qui dépasse cette phase :
noté, pas traité ici.

## Résultat

Paquet construit : 371,6 → **370,7 Ko**.

## Test

Gates : tsc propre · lint 506 fichiers 0 warning · knip propre · 2051 tests / 206 fichiers ·
arch 51/51 · paquet 370,7 Ko · 9 cellules golden identiques · smoke 98/0, 22/22.

Les neuf cellules identiques comptent ici plus qu'ailleurs : ces champs étaient remplis par les
cinq profils de construction, et la sortie des neuf cellules ne bouge pas d'un octet. C'est la
preuve directe qu'ils n'entraient dans aucun artefact.
