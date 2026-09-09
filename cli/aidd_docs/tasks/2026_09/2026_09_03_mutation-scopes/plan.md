---
objective: "Every mutation score in this repo can be reproduced by a committed command, and no source file escapes mutation by being new."
status: implemented
---

# Plan: Make the mutation scores reproducible

## Overview

| Field | Value |
| ----- | ----- |
| **Goal** | Replace a hand-kept file list and four undocumented command lines with scopes the repo declares, runs and checks |
| **Source** | `plan.md` of the context refactor records five per-context scores; `stryker.conf.json` reproduces exactly one of them |

## The measured cause

`stryker.conf.json` names seventeen files under `src/kernel/` explicitly. A file added to
the kernel escapes mutation in silence: the score does not drop, because the mutants that
would have died were never generated. That is the same failure that the stale `translate`
import rule and the emptied `orchestrator-deps` scope already produced in this repo —
a check that stops checking and still reads green.

The four other numbers on record — tools 61,64 %, translate 78,63 %, distribution 74,07 %,
framework 77,97 % — came from command lines typed once and not kept. Nothing in the repo
runs them, so nothing can confirm or refute them. Measured, they turn out to have covered
each context's `domain/` layer alone: `phase-20.md` says so in its "cible" column, and read
without that column they pass for the score of a whole context.

## Phases

| # | Phase | File |
| - | ----- | ---- |
| 1 | Declare the scopes, run them, and check nothing escapes | [`phase-1.md`](./phase-1.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Globs, not file lists | The list is what goes stale. A glob covers a file the day it is written |
| One declared scope map, read by both the runner and its guard | Two lists disagree eventually; one cannot |
| A scope per context, not one run over `src/` | The scores are per context because the contexts have different test pressure. One number would hide which one is weak, and a full run is too slow to be used |
| Every directory under `src/` is scoped; only `src/cli.ts` is excluded | The first draft excluded `presentation` and `runtime` on a reason that measurement refuted — see the result section. An exclusion the guard cannot check is a hiding place, so the set is kept to the one file where the argument survives inspection |
| Never gating, threshold included | Stated in the project goal. A `break` threshold that fails a command is a gate whatever it is called; it is removed. What is enforced is that the score exists and covers everything |

## Résultat (2026-09-03)

Cinq scopes déclarés, cinq commandes qui les rejouent, 23 minutes pour les cinq.

| scope | fichiers | mutants | score | sans couverture |
| ----- | -------: | ------: | ----: | --------------: |
| `contexts/translate` | 16 | 891 | 72,05 % | 48 (5 %) |
| `contexts/distribution` | 23 | 865 | 70,75 % | 63 (7 %) |
| `contexts/framework` | 88 | 4 112 | 66,10 % | 463 (11 %) |
| `runtime` | 38 | 1 000 | 63,50 % | 218 (22 %) |
| `kernel` | 17 | 1 060 | 62,74 % | 117 (11 %) |
| `contexts/tools` | 47 | 2 859 | 61,04 % | 423 (15 %) |
| `presentation` | 25 | 1 712 | **14,08 %** | 1 250 (73 %) |

Durées : distribution 47 s, presentation 47 s, runtime 58 s, translate 3 min, kernel 3 min 13,
framework 4 min 48, tools 11 min 30. Vingt-cinq minutes pour les sept.

### `presentation` à 14 %, et pourquoi il reste un scope

Le premier jet excluait `presentation` et `runtime` en affirmant que leur preuve était e2e et
la smoke, qu'aucun mutant n'atteint. C'était faux, et la revue l'a montré : 31 tests unitaires
et d'intégration visent ces deux répertoires, zéro test e2e n'y est écrit, et
`runtime/self-update/check-update-use-case.ts` est 66 lignes de branchement avec son propre
test unitaire. La garde vérifiait qu'une exclusion porte une raison de plus de quarante
caractères, pas qu'elle soit vraie — un fichier déposé dans `src/runtime/` restait non muté en
silence, le défaut même que cette phase supprime, déplacé de « non listé » vers « exclu pour
une mauvaise raison ».

Les deux sont donc des scopes. `runtime` donne 63,50 %, comparable aux contextes.
`presentation` donne 14,08 %, avec 73 % de ses mutants dans du code qu'aucun test unitaire ni
d'intégration n'exécute — ce qui est le chiffre honnête : sa vraie couverture est le binaire
qui tourne, en e2e et en smoke, et la mutation ne la voit pas. Le score est bas parce que la
mesure ne peut pas voir ce qui le protège, pas parce que rien ne le protège. Il reste mesuré
plutôt qu'écarté, pour que le jour où l'on décide de tester `presentation` en unitaire, le
chiffre le dise.

Seule `src/cli.ts` reste exclue.

### Le seuil de rupture est retiré

`presentation` à 14,08 % passait sous le `break: 50` et faisait sortir la commande en erreur.
L'objectif du projet dit « scorée, jamais bloquante » ; un seuil qui fait échouer une commande
est une porte. `break` est désormais nul, et le runner ne sort en erreur que sur une vraie
panne.

### Ce que la mesure apprend, au-delà du score

**Le périmètre expliquait presque tout l'écart.** `kernel` est la seule cible identique aux
deux mesures : 61,60 % puis 62,74 %. Les quatre autres couvrent maintenant leur contexte
entier au lieu de sa seule couche `domain/`, et le chiffre baisse partout — c'est ce que
`application/` et `infrastructure/` pèsent quand on cesse de ne mesurer que la couche la
plus pure. `framework` passe de 19 fichiers à 88 et de 77,97 % à 66,10 %.

**Le score a du bruit.** Deux runs du noyau sur le même code : 63,11 % puis 62,74 %. Le
nombre de mutants en `Timeout` varie (23 à 26). Deux décimales suggèrent une précision qui
n'existe pas ; l'unité est le point, pas le centième.

**Le signal actionnable n'est pas le score, c'est `NoCoverage`.** 1 114 mutants sur 9 787 se
trouvent dans du code qu'aucun test **unitaire ou d'intégration** n'exécute — pas des mutants
qui survivent à un test faible, des mutants que rien ne regarde. La précision compte : la
mesure tourne sous `vitest.mutation.config.ts`, qui écarte e2e et architecture, donc une
partie de ce code est atteinte par le binaire en e2e. `tools` en a 15 %. C'est la matière
première du travail sur les survivants, et c'est moins ambigu qu'un pourcentage global.
