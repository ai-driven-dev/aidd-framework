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
| `harnais.md` | les garde-fous déterministes, leur état et ce qui reste |
| `plan.md` | le plan exécutable : 19 phases, objectif, ressources, décisions |
| `phase-1.md` … `phase-19.md` | une fiche par phase : projection, parcours, portée de test, tâches, critères |

`migration.md` a été supprimé : sa numérotation en treize phases contredisait les dix-neuf du plan,
et deux systèmes de numéros dans le même dossier sont un piège. Ses deux sections propres sont
reprises plus bas ; tout le reste vit dans `plan.md` et les fiches de phase.

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

## Les filets, et ce que chacun attrape

Un refactor de cette taille ne tient pas sur la relecture. Chaque phase s'appuie sur un filet qui
échoue tout seul, et aucun filet ne couvre tout — d'où la liste.

| Filet | Attrape | Depuis |
|---|---|---|
| golden baseline | un changement de comportement sur un scénario complet, dérive comprise | phase 1, étendu |
| instantané de l'aide | un changement de surface utilisateur pendant un déplacement | phase 1, nouveau |
| golden du build | une sortie de build différente, cellule par cellule | existant, réduit en phase 4 |
| e2e, 15 fichiers | les parcours réels, binaire compris | existant |
| tests d'architecture | les invariants : partage, orchestration, coût d'un outil, doc, carte | livrés |
| smoke, 77 vérifications, 100% des commandes feuilles | une commande qui casse avec ses vrais arguments, binaire compris | existant, **ne tourne nulle part et il est rouge** — phase 2 |
| graphe des contextes | une arête latérale entre contextes | phase 12, nouveau |
| aller-retour du manifest | un modèle qui change et une sortie qui bouge | phase 13, nouveau |
| équivalence des surfaces | un renommage qui change autre chose que le nom | phase 17, nouveau, temporaire |
| Biome | cycles d'exécution, ré-exports, barrels, frontière du domaine | livré |
| knip, jscpd | code mort, duplication en hausse | livrés, bloquants |
| seuils de couverture | un test perdu pendant un déplacement (85 / 80 / 90 / 85) | existant |
| mutation sur `manifest.ts` | des tests qui passent sans rien vérifier, sur l'agrégat que la phase 14 redécoupe | existant, **cassé** — phase 14, tâche 0 |

Trois de ces filets n'existaient pas quand le plan a été écrit la première fois. Ils répondent aux
trois faiblesses qui avaient été signalées : une phase trop grosse, une phase sans filet propre, et
onze déplacements sans preuve que la surface utilisateur n'avait pas bougé.

## Ce que la session a trouvé en exécutant plutôt qu'en lisant

- **Le smoke est rouge et personne ne le sait.** 73 succès, 4 échecs, 7 min 11 s. Aucun job de CI,
  aucun hook. Les quatre échecs sont un seul scénario qui a cessé de tester ce qu'il annonce le jour
  où `aidd-dev` est entré dans les plugins recommandés : `setup --plugins recommended` l'installe,
  donc `plugin install aidd-dev` échoue sur « already installed » avant même de lire le catalogue
  corrompu qu'il vient d'injecter. Défaut de test, pas de produit.
- **La couverture du smoke dépend de l'état d'authentification de la machine.** Ligne 106 :
  `TOKEN="${AIDD_TOKEN:-$(gh auth token 2>/dev/null || true)}"`, et tout ce qui compte est derrière
  `if [[ -z "$TOKEN" ]]`. Compté statiquement : **11 invocations hermétiques contre 30 derrière le
  jeton** — la matrice de setup, les commandes globales, restore, les commandes par outil et par
  plugin, le garde-fou de conflit et l'injection de faute sont toutes dans le bloc gardé. Sur une
  machine où `gh` est connecté, la suite couvre 41 invocations et annonce 100 % ; ailleurs elle en
  couvre 11. Même commande, même dépôt, deux filets différents.
- **Et une commande pend** : `plugin update (all)` a dépassé le plafond de 180 s du script et a été
  tuée. Vu une fois, non diagnostiqué.
- **11 des 24 options déclarées n'ont jamais été passées**, dont `--flat`, que la phase 5 supprime
  pour quatre outils, et `--scope`, qui décide où les fichiers atterrissent.
- **Stryker est cassé, pas seulement dormant.** `stryker.conf.json` mute exactement un fichier,
  `src/domain/models/manifest.ts`, avec un seuil de rupture à 50 — le filet le plus pertinent qui
  soit pour la phase la plus risquée. `stryker run` plante sur
  `TypeError: ts.parseConfigFileTextToJson is not a function` : Stryker 9.6.1 appelle une API que
  TypeScript 7.0.2, le portage natif, n'expose plus. Aucun job, aucun hook, donc personne ne l'a vu
  se casser à la montée de version.
- **Deux de mes propres mesures étaient fausses** avant exécution : le smoke couvre 100 % des
  commandes feuilles, pas 23 sur 27 ; et il fait 77 vérifications, pas 44. L'analyse par regex
  ratait les invocations en boucle.

## Les tests pendant la migration

Il n'y a pas de phase de coupe : la mesure ne la justifie pas (voir `brainstorm.md`). Les tests ont
en revanche deux besoins concrets.

**Réécriture de chemins.** 157 fichiers de test importent `src/`. Chaque phase d'extraction les
casse par le chemin, pas par le comportement. C'est mécanique, et c'est le signe qu'un lot est bien
neutre : si un test échoue autrement que par un chemin, le lot ne l'était pas.

**Extension du filet, en phase 1.** Le golden ne couvre que cinq invocations. Tout le reste du plan
en dépend.

Repères de durée mesurés avant la migration, à surveiller : unit 4,65 s pour 1 520 tests,
integration 2,91 s pour 510, e2e 15,5 s pour 128 après build. Une phase qui fait franchement gonfler
l'un de ces chiffres mérite d'être regardée.

## Ce qui peut être fait en parallèle

Les phases 1 et 2 sont indépendantes l'une de l'autre. Les phases 5 à 9 sont séquentielles par
construction (chaque contexte dépend de celui d'en dessous). La phase 13 suit chaque phase qu'elle
documente, plutôt que d'attendre la fin.

## Télémétrie, développée en parallèle

Elle arrive pendant ce refactor, et elle atterrit dans la structure actuelle : elle suivra ses
couches comme le reste. Trois conséquences à ne pas perdre.

- **Les projections de phase ne la connaissent pas.** Chaque fiche liste des fichiers nommés ;
  ceux que la télémétrie ajoutera devront être intégrés à la projection de la phase qui déplace
  leur couche, sinon ils seront oubliés au déplacement.
- **`docs/FAQ.md:44` promet aujourd'hui le contraire** : « No hosted service. AIDD is prompt content
  you install into your own tool; there is no AIDD server, account, or telemetry. » C'est le seul
  endroit du dépôt qui porte cette promesse — le README ne la contient pas. Elle doit être réécrite
  avant qu'une release embarque de la télémétrie, faute de quoi l'engagement est faux le temps d'une
  version.
- **« Activer la télémétrie pour tel outil » lit l'état que possède `framework`.** L'invariant
  « seul `framework` importe un autre contexte » ne le permet pas. Soit la télémétrie s'active
  globalement en attendant, soit `framework` expose une lecture publique de son état — décision à
  prendre au moment où ce besoin devient réel, pas avant.

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

- **La phase 5 est annulée** : elle voulait supprimer le mode flat pour les quatre outils natifs, en
  croyant qu'il faisait doublon. Vérifié avant exécution : pour Claude, le mode marketplace produit
  198 fichiers sous `.claude-plugin/` et `plugins/`, le mode flat 189 sous `.claude/agents/`,
  `.claude/skills/`, `.claude/hooks/`. Deux livrables différents, et `cli/README.md` documente le
  second. L'erreur venait d'une confusion entre `PluginsCapability.mode`, qui décrit l'installation
  d'un *plugin*, et `FrameworkBuildMode`, qui décrit la construction du *framework*.


Elles sont conservées parce qu'elles disent où le raisonnement a dérapé.

- La matérialisation n'est pas la cause de la moitié du CLI : 3 outils sur 5 pointent déjà.
- `noImportCycles` n'aurait pas attrapé nos cycles : ils se referment par des `import type`, donc
  il n'y a pas de cycle à l'exécution.
- La coupe du volume de tests est abandonnée : la suite tourne en 25 s pour 2 158 tests, aucun sujet
  n'est testé à deux niveaux, un seul fichier sur 139 est lourdement doublé.
- `aidd kanban` ne violait pas la grammaire : il a déjà des sous-commandes avec un défaut.
- `plugin create` sort bien : personne n'écrit de plugin tiers, et la commande n'est documentée nulle part.
