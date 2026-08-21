# Plan de migration

## Règle centrale

Ne jamais mélanger un **déplacement** et un **changement de périmètre** dans le même lot.

| Nature du lot | Critère de succès |
|---|---|
| Déplacement (neutre) | `golden` et e2e passent **sans être modifiés**. Si un test doit changer, le lot n'était pas neutre. |
| Périmètre (visible) | Le snapshot est recapturé (`UPDATE_GOLDEN=1`) et **son diff est la revue** du changement. |

C'est ce qui rend un refactor de cette taille relisible : chaque commit répond à « rien n'a bougé »
ou « voici exactement ce qui a bougé ».

## Phase 0 — Étendre le filet

`tests/golden/snapshots/phase0/snapshot.json` ne contient que cinq invocations — `setup`, `status`,
`restore --force`, `clean --force`, `status` — alors que l'en-tête du test annonce « each public CLI
command ». Trois des cinq sont invalidées par les décisions de surface.

Ajouter les invocations manquantes avant tout déplacement : installation d'un outil,
`plugin install|list|remove`, `marketplace add|list|refresh`, `doctor`, un projet en dérive, et les
chemins d'erreur. Coût faible (une capture), gain décisif : les phases 2 à 11 deviennent
vérifiables. `framework build` en est exclu : il a déjà son propre golden sur les neuf cellules
cible/mode. Détail dans `phase-0.md`.

Corriger aussi l'en-tête, qui promet plus qu'il ne couvre.

## Phase 1 — Suppressions (périmètre, un lot chacune)

Du moins risqué au plus risqué. Chaque lot recapture le snapshot s'il le touche.

1. **Code mort pur**, aucun impact attendu sur le snapshot :
   `loadForeign()` + les 4 parseurs `{cursor,codex,copilot,opencode}-marketplace.ts` +
   `normalized-plugin.ts` + la méthode du port + les 3 stubs de test ;
   `domain/models/marketplace-entry.ts` + son test + son entrée dans `knip.json` ;
   les 4 exports morts de `mcp-exclusion.ts`, `buildMergeFileEntries`,
   `Update{Ai,Ide}Tools{Input,Result}`.
2. **`plugin create`** + `plugin-scaffold.ts` + `plugin-create.e2e.test.ts`.
3. **Migrations `manifest.ts` v1→v6.** Lot à part : cela change ce que le CLI accepte comme manifest
   existant. Vérifier au préalable qu'aucun manifest antérieur à v6 ne circule encore.
4. **Mode flat pour claude, cursor, copilot et codex.** Touche le golden du build : 4 cellules sur 9
   disparaissent.

Gain cumulé : la surface à déplacer diminue avant qu'on la déplace.

## Phase 2 — Préparation, sans déplacer de fichier

Neutre, golden intact.

- Casser le cycle A : sortir `UserFileSection` et `UserFileSectionKey` de `tools/contracts.ts`.
- Casser le cycle B : repointer les 3 imports d'`AI_TOOL_IDS` sur `models/tool-ids.ts`.
- Supprimer les 6 ré-exports (`registry.ts` en porte 8 à lui seul).
- Scinder `plugins-capability.ts` : `PluginsCapability` d'un côté, `MarketplaceSettings*` de l'autre.
- Remplacer `toolId === "opencode" ? "flat" : "marketplace"`
  (`built-tree-materialization-translator.ts:62`) par la lecture de `mode` sur le profil.

## Phase 3 — Redescendre `use-cases/shared/`

12 fichiers sur 14 échouent au test des deux appelants et redescendent chez leur appelant.
Restent `resolve-marketplace` et `ensure-built-marketplace`. Le dépotoir disparaît **avant** le
découpage, pour ne pas le déplacer tel quel. Neutre.

## Phase 4 — Corriger les frontières mal placées

Neutre.

- `use-cases/plugin/translator/` → `framework` (4 de ses 6 fichiers importent `Manifest` et `Plugin`).
- `marketplace-check`, `marketplace-remove`, `marketplace-sync-settings` → flows de `framework`.
- `copilot-marketplace-catalog.ts` → `distribution`.

## Phases 5 à 9 — Extraction des contextes, feuilles d'abord

Chaque phase est neutre et se termine par un `index.ts` de contexte plus une règle de lint qui
interdit d'importer son intérieur.

5. **`kernel`** — 6 fichiers renommés au niveau du concept (`tool`, `source`, `paths`, `file`,
   `merge`, `errors`) plus les ports partagés.
6. **`tools`** — profils, capacités `settings` et `mcp`, config runtime et IDE. Les contrats de
   build rejoignent les profils : `tool-contracts.ts` (820 loc) disparaît. Les unions
   `PluginFormat` et `FrameworkBuildTarget` deviennent dérivées d'`AiToolId`.
   **C'est ici que se vérifie le test d'acceptation : ajouter un outil doit toucher un fichier.**
7. **`translate`** — formats, capacités de contenu, translator, et l'ancien build devenu
   `translate-source`.
8. **`distribution`** — marketplaces, catalogues, cache, confiance.
9. **`framework`** — ce qui reste, plus le découpage de `Manifest` en agrégat racine à membres
   séparés (`ToolEntry` portant `TrackedFiles`, `MergeFiles`, `McpExclusions`, `InstalledPlugin[]`)
   et le typage des trois `Map<string, string>`.

## Phase 10 — `presentation` et `runtime`

Séparer la présentation (commandes, affichage, prompts, `menu` et ses 366 lignes) du runtime
(câblage, http, git, plateforme, auth, self-update). `deps.ts` (733 loc) éclate en un câblage par
contexte. Neutre.

## Phase 11 — kanban en lanceur

`commands/kanban.ts` cesse d'importer `../../../../kanban/src/presentation/…` et localise puis
exécute le binaire. Retrait de `ink`, `react`, `cli-table3` et `gray-matter` de `cli/package.json` :
aucun n'est importé par `cli/src`, ils sont déjà listés en `ignoreDependencies` dans `knip.json`.
Le budget de `check-bundle-size.mjs` baisse d'autant — gain vérifiable.

## Phase 12 — Surface de commandes (périmètre)

**En dernier, et par alias.** Les e2e invoquent le CLI : renommer les commandes casse le filet.
Donc : ajouter la nouvelle surface en alias de l'ancienne, migrer les tests vers la nouvelle,
recapturer le snapshot, puis retirer l'ancienne. Les deux surfaces coexistent le temps de la bascule,
comme les deux dispositions de dossiers.

Ordre interne : `sync` (qui n'existe pas encore) avant le retrait de `restore` ; `doctor` enrichi
avant le retrait de `status` ; `translate` avant le retrait de `framework build`.

## Phase 13 — Docs, règles et skills

- Réécrire `aidd_docs/memory/codebase-map.md` (93 l., 32 réfs) et `architecture.md` (143 l., 16 réfs).
- Réécrire `ARCHITECTURE.md`, faux dès aujourd'hui sur le manifest v6 et sur `aidd sync`.
- Remplacer les 10 skills par une par contexte (`translate`, `tools`, `distribution`, `framework`)
  plus les transversales `test` et `audit-remediate`.
- Trancher le conflit `1-exports.md` : interdire les barrels de confort, autoriser l'`index.ts` de
  frontière de contexte.
- Ajouter les trois invariants cibles aux règles, une fois qu'ils sont vrais : chaîne des contextes,
  `kernel`, entrée publique unique.

## Les tests pendant la migration

Il n'y a pas de phase de coupe : la mesure ne la justifie pas (voir `brainstorm.md`). Les tests ont
en revanche deux besoins concrets.

**Réécriture de chemins.** 157 fichiers de test importent `src/`. Chaque phase d'extraction les
casse par le chemin, pas par le comportement. C'est mécanique, et c'est le signe qu'un lot est bien
neutre : si un test échoue autrement que par un chemin, le lot ne l'était pas.

**Extension du filet, en phase 0.** Le golden ne couvre que cinq invocations. Tout le reste du plan
en dépend.

Repères de durée mesurés avant la migration, à surveiller : unit 4,65 s pour 1 520 tests,
integration 2,91 s pour 510, e2e 15,5 s pour 128 après build. Une phase qui fait franchement gonfler
l'un de ces chiffres mérite d'être regardée.

## Ce qui peut être fait en parallèle

Les phases 1 et 2 sont indépendantes l'une de l'autre. Les phases 5 à 9 sont séquentielles par
construction (chaque contexte dépend de celui d'en dessous). La phase 13 suit chaque phase qu'elle
documente, plutôt que d'attendre la fin.
