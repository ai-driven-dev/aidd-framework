---
status: done
---

# Phase 1 — Ce que le câblage construit et que personne ne lit

## La mesure, et l'instrument qu'il a fallu réparer deux fois

Vingt champs de `Deps` sur soixante-et-un ne sont jamais relus. Prouvé par suppression : le
champ retiré de l'interface **et** de son entrée dans le littéral, `tsc` comme juge, dans une
copie hors dépôt.

Ma première exécution annonçait cinq. Elle était fausse deux fois :

1. Le bac à sable n'avait pas `assets/`, donc `tsc` échouait à chaque itération et **tous** les
   champs paraissaient vivants. Le `DEAD (0)` initial ne mesurait rien.
2. Ma substitution retirait la première ligne `<champ>,` du fichier — souvent un argument de
   constructeur homonyme — au lieu de l'entrée du littéral, laissant une propriété en trop qui
   faisait échouer `tsc` pour une raison étrangère.

Réparé en ciblant le bloc entre `const deps: Deps = {` et sa fermeture, le résultat rejoint
celui de la relecture indépendante : vingt. **La leçon est de vérifier l'instrument avant de
croire sa lecture**, pas de croire un chiffre parce qu'une commande l'a produit.

## La cascade, suivie par l'outil et non devinée

Les vingt champs partis, `tsc --noUnusedLocals` nomme dix imports de type et trois
constructions locales devenues mortes. Les locaux partis, `knip` — qui ne voyait rien jusque-là
parce que les classes restaient construites — signale enfin `wireTranslate`.

`wireTranslate` ne retournait que `frameworkBuildUseCase`, le champ mort. Son commentaire dit
« `framework build`'s own use case » : une commande fusionnée dans `translate` par la refacto.
La fonction entière tombe. Ce qu'elle construisait survit ailleurs — le validateur de schéma et
la stratégie marketplace sont utilisés par le chemin piloté par le registre, et le contrat
copilot par le profil copilot lui-même.

`requireAuthUseCase` parti, `RequireAuthUseCase` n'est plus référencé que par son propre fichier
et son propre test : du code dont la seule raison d'exister est son test.

## La vérification avant suppression

Supprimer une barrière d'authentification demande de prouver qu'il en reste une. Mesuré :
`http-client.ts:85` lève `AuthenticationError` sur 401 et 403, et les deux adaptateurs de fetch
la traduisent en `CatalogFetchAuthError`. `RequireAuthUseCase` était une barrière laissée
derrière, pas la seule.

## Le garde a fait son travail

`RequireAuthUseCase` supprimé, `NotAuthenticatedError` n'est plus levée nulle part, et
`errors-that-are-thrown.arch.test.ts` — posé ce matin, socle vide — l'a nommée immédiatement.
Elle part avec, et son cas de test avec elle.

## Résultat

124 lignes supprimées, 1 ajoutée, sur 6 fichiers. Le paquet construit passe de 374,7 à
373,6 Ko.

## Test

Gates : tsc propre · lint 508 fichiers 0 warning · knip propre · 2070 tests / 206 fichiers ·
arch 51/51 · couverture 93,75 % · paquet 373,6 Ko · 9 cellules golden identiques ·
smoke 98/0, 22/22.

Les neuf cellules golden identiques valent particulièrement ici : vingt champs retirés d'une
racine de composition, et la sortie du binaire ne bouge pas d'un octet.
