---
objective: "cli/src is organised by functional context, each boundary verified by a test rather than a convention, and adding a sixth tool touches one file."
status: implemented
---

# Plan: Refactor the CLI by functional context

## Overview

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **Goal**   | Move from a layer-first tree to four functional contexts, without changing behavior except where a scope change is declared and reviewed on its own |
| **Source** | `aidd_docs/tasks/2026_08/2026_08_20_refactor-contextes-cli/` — nine scoping documents, every figure measured on the code |

## Phases

| #   | Phase                                       | File                             |
| --- | ------------------------------------------- | -------------------------------- |
| 1   | Extend the golden net                       | [`phase-1.md`](./phase-1.md) |
| 2   | Revive and complete the smoke suite         | [`phase-2.md`](./phase-2.md) |
| 3   | Delete dead code                            | [`phase-3.md`](./phase-3.md) |
| 4   | Drop plugin scaffolding                     | [`phase-4.md`](./phase-4.md) |
| 5   | Split the registration by what it can carry    | [`phase-5.md`](./phase-5.md) |
| 6   | Untangle without moving anything            | [`phase-6.md`](./phase-6.md) |
| 7   | Dissolve the shared dumping ground          | [`phase-7.md`](./phase-7.md) |
| 8   | Put three misplaced units where they belong | [`phase-8.md`](./phase-8.md) |
| 9   | Extract the kernel                          | [`phase-9.md`](./phase-9.md) |
| 10  | Extract the tools context                   | [`phase-10.md`](./phase-10.md) |
| 11  | Extract the translate context               | [`phase-11.md`](./phase-11.md) |
| 12  | Extract the distribution context            | [`phase-12.md`](./phase-12.md) |
| 13  | Extract the framework context               | [`phase-13.md`](./phase-13.md) |
| 14  | Split the Manifest aggregate                | [`phase-14.md`](./phase-14.md) |
| 15  | Drop the manifest version migrations        | [`phase-15.md`](./phase-15.md) |
| 16  | Separate presentation from runtime          | [`phase-16.md`](./phase-16.md) |
| 17  | Turn kanban into a launcher                 | [`phase-17.md`](./phase-17.md) |
| 18  | Move the command surface, by alias          | [`phase-18.md`](./phase-18.md) |
| 19  | Rewrite the documentation and the skills    | [`phase-19.md`](./phase-19.md) |
| 20  | Make the tests prove they test something     | [`phase-20.md`](./phase-20.md) |

## Resources

| Source                                                     | Verified                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| https://github.com/obra/superpowers                        | Ten host manifests point at one shared `skills/` folder; no content translation. The comparison is limited: they ship only skills and hooks, the capabilities that converged |
| https://biomejs.dev/linter/rules/no-restricted-imports/     | Stable since 1.6, gitignore-style patterns with negation, custom message, applied per directory through `overrides` |
| https://biomejs.dev/linter/rules/no-import-cycles/          | Detects runtime cycles only. Verified: it flags a deliberate cycle and stays silent on the two found by hand, which close through `import type` |
| ai-driven-dev/framework#592                                 | The roadmap materializes project agents into tool trees, and states that symlinking breaks when formats diverge. Materialization is deliberate |
| ai-driven-dev/framework#465, #468, #464                     | `doctor` reports healthy on a project never set up; four install use-cases and four capability classes duplicate; `status --json` is documented and absent |

## Decisions

| Decision                                                        | Why                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A move and a scope change never share a commit                   | A neutral batch passes golden and e2e untouched; a scope batch recaptures the snapshot and its diff is the review. Without the split, a 22 800-line refactor is unreviewable |
| Translation is the core, framework is one of its clients         | A user on Claude Code can register the marketplace themselves; they cannot convert content into Cursor's `.mdc`, Codex's TOML and Copilot's `.github/instructions` |
| The command surface changes last, through aliases                | The e2e net invokes the CLI. Renaming breaks it exactly when it is most needed |
| A tool is not a managed resource, it is the scope of every command | `ai install cursor` already equips a tool with everything; `tool add` would be the same command twice. `--tool` replaces both groups |
| Two ownership regimes get two treatments                         | Generated files are regenerated; files co-owned with the user are merged. Applying hash tracking to the first is over-engineering, blind rewriting of the second destroys their work |
| Telemetry lands in the current structure and migrates with it     | It is being built in parallel with this refactor. Following today's conventions keeps one structure at a time; the cost is that its files move with their layer, so every phase projection has to account for whatever it added |

## Résultat (2026-09-02)

Les vingt phases sont livrées, une par commit, chacune avec sa fiche.

### Ce que `src/` est devenu

| Zone | Fichiers | Lignes |
| ---- | -------: | -----: |
| `kernel/` | 17 | 1 449 |
| `contexts/tools/` | 47 | 4 609 |
| `contexts/translate/` | 16 | 1 601 |
| `contexts/distribution/` | 23 | 1 447 |
| `contexts/framework/` | 88 | 8 489 |
| `presentation/` | 26 | 2 377 |
| `runtime/` | 38 | 2 284 |
| **total** | **256** | **22 365** |

Pas de barils, pas d'`index.ts` : la surface publique de chaque contexte est une liste dans
`context-boundary.arch.test.ts`, et les arêtes autorisées sont dans `context-graph.arch.test.ts`.

### L'objectif, honnêtement

« Ajouter un sixième outil touche un fichier » est vrai pour tout ce qui est propriété de l'outil :
son profil déclare sa mise en page, ses capacités, ses contrats de build et l'emplacement de son
manifeste. Trois fichiers nomment encore des outils, chacun justifié ligne par ligne dans le socle
de `tool-addition-cost` — un recommandeur qui doit nommer ce qu'il recommande, un artefact de config
qui s'écrit comme son outil, et une liste blanche assumée des trois CLI pilotées.

### Le filet

- 1 987 tests sur 982 suites, unitaires majoritaires, intégration et e2e déterministes
- 26 tests d'architecture, chaque règle éprouvée par injection d'une violation de synthèse
- smoke : 98 assertions, 22 / 22 commandes feuilles
- mutation par contexte, couche `domain/` seule : translate 78,63 %, framework 77,97 %,
  distribution 74,07 %, tools 61,64 %, kernel 61,60 % — mesurée, jamais bloquante. Ces runs
  n'étaient reproductibles par aucune commande gardée ; les scopes commités de
  `2026_09_03_mutation-scopes` couvrent chaque contexte en entier et donnent d'autres chiffres

### Ce qui a été trouvé en chemin, et qui n'était pas au plan

Chaque garde-fou n'a valu que par ce qu'il a attrapé :

- une règle d'import `translate` qui ne mordait plus depuis six phases, trouvée en l'éprouvant
- deux suites qui ne se chargeaient plus, invisibles dans un run vert : les suites se comptent,
  pas seulement les tests
- un socle de ratchet dont la portée était devenue vide, qui déclarait tout réparé
- deux tests unitaires qui lisaient la vraie config de l'utilisateur
- quatre dépendances d'interface texte chargées à chaque invocation, pour une commande masquée

### Ce qui reste à décider, et qui appartient à l'utilisateur

- retirer `ink`, `react`, `cli-table3` et `gray-matter` de `cli/package.json` : kanban les déclare
  déjà toutes les quatre, mais cela demande de décider ce que fait `aidd kanban` sans elles
- si kanban se publie à part, avec son propre `bin`
- les marketplaces hébergées, qui gardent la phase 5b ouverte (`marketplaces-heberges.md`)
