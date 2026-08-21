# Refactor du CLI par contextes fonctionnels

Sept documents, produits par une session de cadrage adossée à des mesures sur le code.
Chaque affirmation chiffrée y est reproductible.

| Document | Contenu |
|---|---|
| `brainstorm.md` | l'intention affinée : mission du CLI, quatre contextes, décisions et invariants |
| `findings.md` | toutes les mesures : volumétrie, glissements de sens, cycles, code mort, comparaison Superpowers |
| `arborescence.md` | l'arbre cible fichier par fichier, avec les règles de dépendance |
| `commandes.md` | la surface de commandes cible et sa grammaire |
| `domaine.md` | critique du domaine et sa cible, avec le test d'acceptation |
| `migration.md` | le plan en treize phases et sa règle centrale |
| `harnais.md` | les garde-fous déterministes, leur état et ce qui reste |
| `plan.md` | le plan exécutable : 17 phases, objectif, ressources, décisions |
| `phase-1.md` … `phase-17.md` | une fiche par phase : projection, parcours, portée de test, tâches, critères |

`migration.md` reste la note de cadrage qui a produit le plan ; `plan.md` et ses phases sont
l'artefact exécutable. En cas d'écart, `plan.md` fait foi.

## Décisions structurantes

- Le CLI lance et rend cohérent l'écosystème. Sa valeur propre est **la translation**.
- Quatre contextes en chaîne : `framework` → `translate` → `tools` → `kernel`, plus `framework` → `distribution`.
- Deux régimes de propriété des fichiers : possédés donc régénérés, co-possédés donc fusionnés.
- Grammaire des commandes : verbe nu pour une action, nom puis verbe pour une ressource.
- `translate` absorbe `framework build`. `sync` remplace `restore`. `doctor` absorbe `status`.
  `ai` et `ide` deviennent le flag `--tool`. `update` sans sujet met à jour le CLI.
- kanban, telemetry et governance sont lancés, pas contenus.

## Test d'acceptation

**Ajouter un sixième outil doit toucher un fichier et une ligne d'enregistrement.**
Aujourd'hui : huit endroits. Vérifié en continu par `tests/architecture/tool-addition-cost.arch.test.ts`.

## Livré pendant le cadrage

- Six règles d'architecture auto-porteuses, scopées, plus le non-ré-export dans `1-exports.md`.
- Cinq tests d'architecture avec cliquet, vérifiés, 238 ms, en pre-commit et en CI.
- Quatre règles Biome activées, dont la frontière du domaine, vérifiée dans les deux sens.
- `continue-on-error` retiré de knip et jscpd ; seuil jscpd à 3,5 % pour 3,43 % mesurés.
- Trois mensonges de documentation corrigés : `aidd sync` annoncé et inexistant, six dossiers absents
  de `codebase-map.md`, et le manifest v6 prétendant porter les marketplaces.
- Un ré-export supprimé : `doctor-use-case.ts` réexportait du domaine pour un test.

## Points encore ouverts

| Sujet | État |
|---|---|
| Skills, une par contexte | à écrire après le déplacement du code, ordre choisi |
| `doctor` doit gagner l'inventaire des outils | ajout à concevoir, et il est cassé (#465) |
| `enable`/`disable` distinct d'`install`/`remove` | existe chez Claude, à évaluer pour AIDD |
| Placement d'`errors.ts` (457 loc) | kernel, ou découpé par contexte avec la base en commun |
| Découpage de `framework/application` entre `flows/` et `cases/` | validable après la phase 3 |
| Conflit `1-exports.md` vs `index.ts` de contexte | à trancher au moment du déplacement |
| Gouvernance | définie comme un sas recevant la télémétrie, pas davantage |

## Corrections faites en cours de route

Elles sont conservées parce qu'elles disent où le raisonnement a dérapé.

- La matérialisation n'est pas la cause de la moitié du CLI : 3 outils sur 5 pointent déjà.
- `noImportCycles` n'aurait pas attrapé nos cycles : ils se referment par des `import type`, donc
  il n'y a pas de cycle à l'exécution.
- La coupe du volume de tests est abandonnée : la suite tourne en 25 s pour 2 158 tests, aucun sujet
  n'est testé à deux niveaux, un seul fichier sur 139 est lourdement doublé.
- `aidd kanban` ne violait pas la grammaire : il a déjà des sous-commandes avec un défaut.
- `plugin create` sort bien : personne n'écrit de plugin tiers, et la commande n'est documentée nulle part.
