---
status: pending
---

# Phase 5 — Trois adaptateurs, et l'un d'eux ne devrait pas exister

## Ce que la mesure dit, contre ce que le plan annonçait

Le plan estimait 105 mutants pour cette phase, écrits avant la mesure. Re-mesuré sur les
périmètres `distribution` et `runtime` :

| Cible | Sans couverture | Survivants | Vivants |
| ----- | --------------: | ---------: | ------: |
| `plugin-fetcher-adapter.ts` | 39 | 35 | **74** |
| `auth-provider-adapter.ts` | 32 | 0 | **32** |
| `self-update/git-adapter.ts` | 34 | 3 | **37** |

143, pas 105. C'est précisément pourquoi le plan interdisait d'écrire les phases avant de
mesurer.

## Le fait qui change la phase

`GitAdapter.installPreCommitDelegate` n'est appelé par personne.

```sh
grep -rn "deps\.git|\bgit\b\s*[,}]" src            # rien hors du câblage
grep -rnE "^\s*(const|let)\s*\{[^}]*\bgit\b" src   # aucune déstructuration
git log -S "installPreCommitDelegate" -- cli/src   # un seul commit : la migration
```

Le câblage construit `new GitAdapter(fs)` et pose l'objet dans un champ `git` que rien ne
relit. `noGit`, le bouchon du helper de test, est exporté et jamais reçu. Aucun cas d'usage ne
prend un `VersionControl`. La capacité — installer un hook pré-commit qui délègue à `aidd` —
n'a jamais tourné depuis son arrivée dans ce dépôt.

Vérifié avant de conclure, parce que supprimer ce que l'outil est seul à faire serait une perte :
rien d'autre dans `src` n'installe de hook git (les occurrences `hooks.json` sont les hooks de
plugin, un autre concept), et aucun plugin ne le fait non plus — `aidd-vcs` se contente de
réagir à un hook déjà présent.

Écrire 37 mutants de tests sur du code que personne n'appelle reviendrait à figer un
comportement que personne n'observe. Il est supprimé.

`knip` ne l'a jamais signalé : l'objet est bien construit, donc l'outil le voit utilisé. C'est
le même angle mort qui a caché la citation sans préfixe au test `referenced-paths` — un garde
qui mesure la forme, pas l'usage.

## Ordre, et pourquoi

1. **`auth-provider-adapter`** — 32 mutants, aucun risque de fusion : `next` n'y touche pas.
2. **`plugin-fetcher-adapter`** — 74 mutants ; `next` a modifié `github-raw-fetcher-adapter.ts`,
   donc ces tests pourront demander une révision après l'intégration.
3. **La suppression** — commit séparé. Sa justification n'est pas de même nature que celle des
   tests, et l'enterrer dans un message sur la couverture mutationnelle la rendrait invisible.

`next` a aussi modifié `git-adapter.ts`. Le conflit de fusion se résoudra par la suppression,
et c'est écrit ici pour que personne ne le ressuscite en croyant bien faire.

## Ce qui se teste, par intention

### `auth-provider-adapter`

Le `logout` est déjà épinglé par `auth-logout-use-case.integration.test.ts`. Restent :

- `login` par jeton vérifie le jeton ; `login` externe appelle le fournisseur nommé
- `login` enregistre au niveau demandé, avec la racine du projet
- `status` sans configuration répond « pas authentifié », et ne vérifie rien
- `status` avec configuration renvoie le niveau enregistré
- une configuration externe sans fournisseur nommé retombe sur `gh`
- une configuration par jeton sans jeton lève « invalid config »
- un fournisseur externe inconnu lève une erreur qui **nomme** le fournisseur demandé

### `plugin-fetcher-adapter`

Deux tests portent une conséquence de sécurité et passent en premier :

- un jeton présent dans l'URL ne doit pas atteindre le message d'erreur (`scrubCredentials`)
- un échec SSH doit recevoir le conseil SSH, pas le conseil « pose un jeton »

Puis les clés de cache, qui décident silencieusement d'un re-clonage ou d'un cache partagé :

- `github` : `github-<owner>-<repo>-<ref|HEAD>`
- `url` : URL encodée + `-<ref>` ou `-HEAD`
- `git-subdir` : URL encodée + `-subdir-<chemin avec _>` + ref
- `encodeKey` tronque à 64 caractères — épinglé tel que documenté, **sans** affirmer l'absence
  de collision, que le code déclare explicitement ne pas garantir

Puis le reste du comportement observable :

- `git@` n'accepte pas d'injection de jeton ; une URL https en accepte une
- `forceRefresh` supprime le répertoire avant de recloner, et ne fait rien s'il est absent
- clonage superficiel : `--depth 1`, et `--branch <ref>` seulement si une ref est donnée
- clonage épars : `--filter=blob:none --no-checkout`, puis `sparse-checkout set`, puis la ref
- `npm` sans version résout `@latest`, et un échec cite la spécification demandée
- un chemin local absent lève une erreur qui donne le chemin **résolu**

## Test

`pnpm test:mutation:distribution` et `pnpm test:mutation:runtime` re-mesurés à la fin : les
mutants vivants des deux adaptateurs conservés doivent baisser, et `git-adapter.ts` doit avoir
disparu du rapport.
