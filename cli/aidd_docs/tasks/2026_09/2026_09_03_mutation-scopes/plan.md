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
| `presentation` and `runtime` stay out, explicitly | Their behaviour is proven by e2e and smoke, which mutation excludes because they spawn a built binary no mutant reaches. Mutating them scores noise, not coverage. Out by declaration, so the guard can tell an exclusion from an oversight |
| Never gating | Stated in the project goal. The score is read, not enforced; what is enforced is that the score exists and covers everything |

## Résultat (2026-09-03)

Cinq scopes déclarés, cinq commandes qui les rejouent, 23 minutes pour les cinq.

| scope | fichiers | mutants | score | sans couverture |
| ----- | -------: | ------: | ----: | --------------: |
| `kernel` | 17 | 1 060 | 62,74 % | 117 (11 %) |
| `contexts/translate` | 16 | 891 | 72,05 % | 48 (5 %) |
| `contexts/distribution` | 23 | 865 | 70,75 % | 63 (7 %) |
| `contexts/tools` | 47 | 2 859 | 61,04 % | 423 (15 %) |
| `contexts/framework` | 88 | 4 112 | 66,10 % | 463 (11 %) |

Durées : distribution 47 s, translate 3 min, kernel 3 min 13, framework 4 min 48,
tools 11 min 30.

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
trouvent dans du code qu'aucun test n'exécute — pas des mutants qui survivent à un test
faible, des mutants que rien ne regarde. `tools` en a 15 %. C'est la matière première du
travail sur les survivants, et c'est moins ambigu qu'un pourcentage global.
