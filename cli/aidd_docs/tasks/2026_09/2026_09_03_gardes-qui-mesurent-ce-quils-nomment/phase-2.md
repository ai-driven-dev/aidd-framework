---
status: done
---

# Phase 2 — Les gardes dont le périmètre est plus étroit que le nom

## Quatre candidats, trois défauts

| Garde | Périmètre | Verdict |
| ----- | --------- | ------- |
| `codebase-map` | l'arbre vers la carte, par **noms** de répertoire | réel — cinq blocs fantômes invisibles |
| `referenced-paths` | `.claude/skills` seulement | réel — huit citations mortes ailleurs |
| `docs-do-not-lie` | deux documents | réel — le brief enseignait l'ancienne surface |
| `no-shared-binary` | `tests/` seulement | **écarté**, mesuré |

## `codebase-map` — des noms aux chemins

Le garde comparait des noms de répertoire. Un `application/` dessiné sous `contexts/tools/`
passait donc, puisque `application` existe ailleurs. Et il ne regardait qu'un sens.

Passé aux chemins complets, reconstruits depuis l'indentation de l'arbre : 70 dessinés, 65
réels, zéro réel non dessiné — l'ancienne direction était satisfaite, elle ne pouvait rien voir
de l'autre côté. Les cinq surplus :

```
src/application            src/domain
src/application/use-cases  src/domain/models
src/contexts/tools/application
```

Les deux premiers étaient décrits comme « currently empty (.gitkeep) » alors qu'ils n'existaient
pas du tout, et la table de placement envoyait un développeur dans l'un d'eux. Le troisième
attribuait à `tools` six cas d'usage qui vivent dans `framework` — contredisant le commentaire
de `context-boundary`, qui dit que `tools` n'a pas de couche application parce qu'installer est
le travail de `framework`.

Une carte qui invente un répertoire est pire qu'une carte qui en omet un : le lecteur crée un
fichier là où rien n'appartient.

## `referenced-paths` — au-delà des skills

Huit citations mortes hors du périmètre, dont quatre dans `memory/testing.md`, chargé dans
chaque conversation, et trois dans `vitest.config.ts` : des exclusions de couverture pointant
des répertoires disparus. Elles n'excluaient donc rien, les fichiers que leur commentaire
défend d'inclure étaient comptés, et le seuil était à un point d'échouer pour une raison que
personne n'avait voulue.

`aidd_docs/tasks/` reste volontairement hors périmètre : ce sont des archives. Un plan terminé
qui décrit l'arbre tel qu'il était est un relevé, pas une instruction.

Deux ajustements du matcher, tous deux des faux positifs et non des défauts : un `.ts` cité en
`.js` est la forme ESM correcte, et une barre oblique finale se retire sans casser le chemin.

**Et mon propre commentaire de correction citait les chemins morts qu'il décrivait.** Le garde
l'a refusé, à raison. Expliquer une correction demande de nommer l'ancien chemin ; il faut donc
le décrire au lieu de l'écrire.

## `docs-do-not-lie` — le document qui mentait n'était pas regardé

Périmètre étendu au brief, à la carte et aux guidelines. Le brief présentait la surface
d'avant la refacto comme actuelle — `ai install`, `ide install`, `plugin create`,
`framework build`, `self-update` — **et** listait `aidd sync` comme supprimé alors que la
commande existe. Faux dans les deux sens.

La surface est réécrite depuis `--help`. Le relevé des retraits pointe vers `commandes.md`, où
il vit avec ses raisons, au lieu d'être recopié ici où il a déjà vieilli deux fois. Un
diagramme de parcours enseignait aussi trois commandes disparues ; il est raconté avec celles
qui existent.

## `no-shared-binary` — élargissement écarté

Une relecture proposait d'étendre à `scripts/`. Mesuré : rien sous `tests/` ne lit plus le
`dist/` partagé, et les deux lecteurs restants sont `smoke-tools.sh` et
`check-bundle-size.mjs`, dont le rôle est d'éprouver le binaire livré. Les deux construisent
avant de lire. Interdire reviendrait à interdire la seule chose qui teste ce qu'un utilisateur
installe.

Le refus est écrit dans le docstring du garde, pour qu'un prochain lecteur ne rouvre pas la
question.

## Une gate inerte rendue réelle

Les seuils de couverture existaient dans `vitest.config.ts` et **rien ne les exécutait** :
aucun `--coverage` dans un script, un hook ou un workflow. Des seuils configurés et jamais
lancés se lisent comme une couverture que le projet n'a pas.

Mesuré après repointage des exclusions : 93,76 / 89,30 / 94,49 / 93,76, contre 86,23 avant.
Seuils portés juste en dessous — 92 / 87 / 93 / 92 — et sondés : `statements: 99` sort en
`exit 1` avec `Coverage for statements (93.76%) does not meet global threshold (99%)`, `92`
sort en 0. `pnpm test:coverage` existe, un job CI l'exécute.

## Test

`pnpm test:arch` — 45 tests. Chaque élargissement a nommé ses violations avant correction.

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2067 tests / 207 fichiers ·
arch 45/45 · couverture 93,76 % au-dessus de seuils qui mordent · 9 cellules golden identiques ·
smoke 98/0, 22/22.
