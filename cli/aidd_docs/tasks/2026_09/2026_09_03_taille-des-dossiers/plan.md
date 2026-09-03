---
objective: "Every folder over the size limit is either split for a reason, or carries the reason it stays — and no promise of a later phase."
status: implemented
---

# Plan: Pay down the folder-size baseline, and settle whether framework splits

## The question that came first, and its answer

`contexts/framework` is 88 files and 8 248 lines — 38 % of `src/`, against 16 files for
`translate`. The question was whether it is one context or three (`install`, `sync`,
`restore`).

**It is one.** Not one of its ten application subdirectories is free of the manifest.

Predicate, so the next reader can re-run it rather than trust it — a file counts when it
imports a module whose path names the manifest:

```sh
grep -rlE 'from "[^"]*[Mm]anifest' src/contexts/framework/application/<subdir> --include='*.ts'
```

| doctor | flows | uninstall | plugin | install | global | restore | setup | framework | shared |
| ------ | ----- | --------- | ------ | ------- | ------ | ------- | ----- | --------- | ------ |
| 7/7 | 3/3 | 5/5 | 6/8 | 5/11 | 5/8 | 3/8 | 1/3 | 4/6 | 2/3 |

41 files of 62, measured after the moves below. The number is what an independent review
reproduced; the 36/62 first recorded here was not reproducible under any predicate either of
us tried, and the earlier table omitted two of the ten subdirectories.

But coupling this dense is an argument for a *shared* manifest, not against a split — this
repo already carries a fourth thing three contexts depend on, and it is called `src/kernel`.
So the count is not what settles it. What settles it: a context owns a concept, this one owns
the installation record, and the manifest is that record's lifecycle — created by install,
read by doctor, rewritten by sync, replayed by restore. Split it three ways and no context
owns it; the lifecycle fragments and the aggregate has to be duplicated or promoted. 88 files
is a size observation, not a boundary violation.

Recorded here so the next person to ask finds the measurement and its predicate instead of
re-deriving both.

## What is actually owed

`tests/architecture/folder-size.arch.test.ts` holds four directories over its limit of ten,
two of them promising a split "by a later phase". That promise is the debt.

| Directory | Files | What is really there |
| --------- | ----: | -------------------- |
| `src/contexts/tools/domain` | 12 | Five capability classes live in `capabilities/`, three live beside it. Same suffix, same role, two locations, no stated reason |
| `src/contexts/framework/application/install` | 12 | `uninstall-tools-use-case.ts` sits here while `uninstall/` exists and holds its only importers. And four 33-line descriptors around one shared engine |
| `src/kernel` | 11 | A vocabulary the contexts speak — with one cohesive pair inside it, seen only later |
| `src/presentation/commands` | 14 | Twelve files carrying the command surface, plus two helpers |

The first two hide a real inconsistency. `src/kernel` was written off here as arbitrary, and
that was wrong: `flat-paths.ts` is read by six files across `tools` and `translate` and
`relative-link-rewrite.ts` by seven — eight distinct files, five of them reading both — and
both answer where content lands and how its links follow. A follow-up named that
`materialization/` and the entry left. Only `src/presentation/commands` stays.

## Phases

| # | Phase | File |
| - | ----- | ---- |
| 1 | Put the capability classes where the capability classes live | [`phase-1.md`](./phase-1.md) |
| 2 | Give the install folder its two real groupings | [`phase-2.md`](./phase-2.md) |
| 3 | Replace the two remaining promises with their reason | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| A baseline entry leaves only when the defect behind it is fixed | Shuffling files to get under a count is churn that reads as progress. `tools/domain` drops to 9 because three classes rejoin their siblings, not because three files moved |
| Two entries stay, with a reason instead of a promise | "A later phase" is a debt nobody owes. A reason is a decision someone can disagree with. This is the shape `tool-addition-cost` already uses for what it cannot fix |
| These are moves, so the built output must not change | The gate is not the suite passing; it is nine build outputs byte-identical to the ones taken before the first file moved. A move that changes output is not a move |

## Gates

Every phase runs all of them, and none is optional:

| Gate | Command |
| ---- | ------- |
| Types | `pnpm typecheck` |
| Lint | `pnpm lint`, zero warnings included |
| Dead code | `pnpm knip:production` |
| Suite | `pnpm test`, with passed/total equal for **suites** and tests |
| Architecture | `pnpm test:arch` |
| Journeys | `pnpm smoke`, 98/0 across 22 of 22 leaf commands |
| Output | nine target/mode builds byte-identical to the pre-move capture |

## Résultat (2026-09-03)

| Dossier | Avant | Après | Ce qui a bougé |
| ------- | ----: | ----: | -------------- |
| `contexts/tools/domain` | 12 | **9** | Trois classes de capacité rejoignent les cinq autres dans `capabilities/` |
| `framework/application/install` | 12 | **6** | `uninstall-tools-use-case` rejoint `uninstall/`, où vivent ses seuls importateurs ; les quatre descripteurs et leur moteur passent dans `install/content/` |
| `presentation/commands` | 14 | 14 | Reste, avec sa raison |
| `kernel` | 11 | 11 | Reste, avec sa raison |

### Ce que les gardes ont attrapé, et que le compilateur n'aurait pas vu

Trois tests d'architecture ont échoué pendant le déplacement :

- `codebase-map` — le dossier `content/` absent de la carte
- `context-boundary` — neuf entrées périmées sur dix-huit lignes : quatre dans la liste des
  modules publics, cinq dans son socle
- `tool-addition-cost` — une entrée de socle pointant l'ancien emplacement

Les socles suivent les fichiers. Aucun n'a grossi.

### Les gates

| Gate | Résultat |
| ---- | -------- |
| Types | propre |
| Lint | 511 fichiers, zéro avertissement |
| Code mort | `knip` exit 0 |
| Suite | 205 fichiers de test, 2 032 / 2 032 tests |
| Architecture | 33 / 33 |
| Sortie | les neuf builds identiques octet pour octet à la capture d'avant le premier déplacement |
| Parcours | smoke 98 / 0, 22 commandes feuilles sur 22 |

La sixième est la seule qui vaut pour un déplacement, et elle a été prise avant que le premier
fichier bouge. Un déplacement qui change la sortie n'est pas un déplacement.

Éprouvé après coup : un dossier synthétique de onze fichiers est bien détecté. Le test
s'arrêtait là — il prouvait le détecteur, pas le socle, alors que le critère écrit ici
promettait le second. Corrigé depuis : le dossier synthétique traverse `expectRatchet`, qui
le nomme.

Les chiffres de gate ci-dessus étaient faux dans la première version de ce document et dans
les messages de commit `224deafa` et `884501da` : « 485 fichiers », « 1 001 suites ». `pnpm
lint` en compte 511 — 485 est le compte de `biome check src tests`, une commande plus étroite
que la gate qu'il nommait. `pnpm test` rapporte 205 fichiers de test. Le 2 032 tenait.
