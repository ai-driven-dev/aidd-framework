# Réorganiser le CLI par contextes fonctionnels

L'architecture clean tient sur le papier : aucun import du domaine vers l'extérieur. Ce qui a dérivé, ce sont les frontières fonctionnelles. Les dossiers rangent par couche technique, donc chaque capacité produit est éparpillée sur trois niveaux ; `use-cases/shared/` est devenu un dépotoir dont 2 fichiers sur 14 sont réellement partagés ; `deps.ts` pèse 733 lignes ; et le même mot désigne cinq choses différentes selon l'endroit — « plugin » est tour à tour ce qu'on écrit, une offre de catalogue, une charge utile téléchargée et un enregistrement installé, chacun avec déjà son propre type.

La cible réorganise le premier niveau par contexte fonctionnel. Un contexte contient plusieurs cases ; la case reste l'unité technique.

## Mission du CLI

Le CLI lance et rend cohérent l'écosystème AIDD : installer le framework, lancer le kanban, activer la télémétrie pour un outil donné, et bientôt la gouvernance — un sas vers lequel les informations de télémétrie seront envoyées.

Sa valeur propre est la **translation**. Un utilisateur sous Claude Code peut déjà ajouter le marketplace lui-même ; le CLI ne lui apporte rien là. Ce qu'il ne peut pas faire seul, c'est convertir un même contenu en `.mdc` Cursor, en TOML Codex et en `.github/instructions` Copilot. C'est le seul endroit où le CLI est irremplaçable, et c'est donc le cœur.

## Ce qui est clair

- **Quatre contextes, en chaîne.** `framework` → `translate` → `tools` → `kernel`, plus `framework` → `distribution`. Aucune autre arête entre contextes.
  - **translate** — convertir une source canonique vers le format natif de N cibles. Clients : le framework, `.aidd/agents` (#592), demain d'autres sources.
  - **tools** — quels outils le projet cible, et leur configuration.
  - **distribution** — d'où vient le contenu.
  - **framework** — quel framework et quels plugins sont posés, à quelle version. Cycle de vie de dépendance, proche d'un gestionnaire de paquets, ce qui explique que `manifest.json` ressemble à un lockfile.
- **Deux régimes de propriété, et c'est la distinction structurante.** Les fichiers de contenu générés appartiennent au CLI : gitignorés selon #592, jetables, donc on les **régénère**. Les fichiers de configuration (`settings.json`, `.mcp.json`, `.vscode/`) sont **co-possédés** avec l'utilisateur, qui a le droit d'y mettre ses propres choses : là, fusion, diagnostic et conflits ont une vraie valeur. La suringénierie n'est pas `doctor` ni `restore` en soi, c'est d'appliquer le même appareillage d'empreintes et de fusion aux deux régimes.
- **`restore` est le régénérateur, mal nommé.** `sync/` ne fait que 79 lignes et n'est qu'une politique de conflit. C'est `restore` (~800 loc avec ses satellites) qui réécrit depuis la source, ce que #592 décrit comme le geste quotidien (« CI/dev runs sync after checkout »). La commande porte le nom du cas de secours alors qu'elle fait le travail courant.
- **Le framework AIDD est le sujet privilégié.** Le code le dit déjà : `FRAMEWORK_MARKETPLACE_NAME` est un nom réservé que `marketplace-add-use-case.ts:42` refuse, `Marketplace.isFramework()` existe comme prédicat, `setup` porte un `--skip-framework`. La cible en fait une règle assumée au lieu d'une exception subie.
- **Les chapeaux vivent dans `framework`** et dépendent des entrées publiques des autres contextes, pas de use cases individuels. Les 13 dépendances au constructeur de `SetupUseCase` mesurent l'écart actuel.
- **Ni saga, ni event sourcing, ni CQRS.** Zéro rollback, zéro compensation, zéro bus d'événements dans 22 800 lignes. Une exécution ratée est réparée par l'utilisateur via un diagnostic ou une régénération. Le couple « chapeau plus sous-use-cases » est le bon pattern ; c'est son rangement dans `shared/` qui était faux.
- **Le partage se mérite** : appelants dans au moins deux contextes. Sur les 14 fichiers de `use-cases/shared/`, deux seulement passent la règle (`resolve-marketplace`, `ensure-built-marketplace`) et cinq n'ont qu'un seul appelant.
- **kanban, telemetry et governance sont lancés, pas contenus.** Le CLI les localise et les exécute. Cela évite de faire entrer `ink` et `react` — déjà dans les dépendances, ignorés par `knip.json` parce que seul kanban les utilise — dans le bundle de tous les utilisateurs, alors qu'un budget de taille est vérifié par `scripts/check-bundle-size.mjs`.
- **Télémétrie : user-scope, sans override projet.** Décision de confiance avant d'être une décision d'architecture : si un projet pouvait l'activer, cloner un dépôt déclencherait l'envoi de données à l'insu de celui qui clone. Le projet peut demander, la personne décide.
- **Les neuf cellules de build sont conservées.** La décision inverse avait été prise puis annulée : elle reposait sur une confusion entre deux axes. `PluginsCapability.mode` décrit comment un *plugin* s'installe dans un outil ; `FrameworkBuildMode` décrit comment le *framework* est construit pour une cible. Le constat « quatre outils sur cinq sont en `native` » portait sur le premier et ne disait rien du second. Vérifié dans le golden de build : pour Claude, le mode marketplace produit 198 fichiers sous `.claude-plugin/` et `plugins/`, le mode flat en produit 189 sous `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`. Deux livrables différents, et `cli/README.md` documente le second — « or when you want files on disk in the project ».
- **Publier plutôt que consommer.** Lire les catalogues cursor/copilot/codex disparaît (code mort) ; publier le framework dans les registres tiers devient une capacité côté auteur, aux côtés de `build-distribution`.
- **Ports et adapters par contexte** ; chaque contexte expose un seul `index.ts`. `deps.ts` éclate en un câblage par contexte.
- **Présentation et runtime sont deux couches**, pas une coquille. La présentation (commandes 1736, affichage 139, menu 366, prompts ~300) inclut des fichiers aujourd'hui rangés en `use-cases/`. Le runtime porte le câblage, http, git, plateforme, auth, self-update.
- **Filet de comportement gelé** : 13 fichiers `tests/e2e/` plus 2 `tests/golden/`. `tests/e2e/helpers.ts` importe trois symboles de `src`, donc le filet n'est pas totalement indépendant des chemins.
- **Arbre de tests miroir conservé**, pour ne pas ajouter de bruit dans `src`. Contrepartie assumée : chaque extraction future de contexte sera un déplacement à deux arbres.
- **La coupe du volume de tests est abandonnée, faute de justification mesurée.** Les trois motifs retenus au départ ne résistent pas aux chiffres : la suite complète tourne en ~25 s pour 2 158 tests (unit 4,65 s / 1 520, integration 2,91 s / 510, e2e 15,5 s / 128) ; aucun sujet n'est testé à deux niveaux d'après les noms de fichiers ; et un seul fichier sur 139 dépasse dix doublures, pour 84 occurrences au total. Le ratio de 1,44:1 entre tests et source décrit une suite saine, pas une suite obèse. Ce dont les tests ont réellement besoin est ailleurs : réécrire les chemins des 157 fichiers qui importent `src/` lors des déplacements, et étendre le filet golden qui ne couvre que cinq invocations.
- **Atterrissage incrémental**, les deux dispositions coexistent, feuilles d'abord.

## Invariants

1. `presentation` → contextes → `kernel`. Aucune flèche inverse.
2. Chaîne unique : `framework` → `translate` → `tools` → `kernel`, plus `framework` → `distribution`.
3. `kernel` n'importe aucun contexte et ne porte aucune logique métier.
4. Un contexte expose un seul `index.ts` ; rien n'importe son intérieur.
5. Aucun barrel de ré-export dans un contexte.
6. Un module n'est partagé que s'il a des appelants dans au moins deux contextes.
7. Un chapeau ne dépend pas de plus de contextes qu'il n'en traverse.
8. Fichiers possédés → régénération. Fichiers co-possédés → fusion et diagnostic.
9. Les lanceurs ne contiennent pas l'applicatif : ils le localisent et l'exécutent.

## Suppressions actées

- Branche catalogues étrangers : `loadForeign()`, les 4 parseurs `{cursor,codex,copilot,opencode}-marketplace.ts` et `normalized-plugin.ts`. Aucun appelant en production ; seuls le port la déclare et trois tests la bouchonnent.
- `domain/models/marketplace-entry.ts` (103 loc) : seul fichier inatteignable depuis `src/cli.ts`, et `knip.json` l'ignore explicitement au lieu qu'il soit supprimé. L'homonyme vivant est `domain/capabilities/marketplace-entry.ts` (25 loc).
- Quatre exports morts de `mcp-exclusion.ts` (`extractMcpKeys`, `filterMcpExclusions`, `computeMcpExclusions`, `detectNewMcpEntries`), plus `buildMergeFileEntries` et `Update{Ai,Ide}Tools{Input,Result}`.
- `plugin create` et `plugin-scaffold.ts` : personne n'écrit de plugin tiers aujourd'hui.

## Encore ouvert

- **Nommage des commandes.** Le découpage en quatre ne se reflète plus dans la surface actuelle. À revoir entièrement.
- **`translate` comme commande publique générique** — « ce que tu passes en IN, il le met en OUTPUT selon la cible » — est à décider indépendamment du fait que le contexte est au cœur.
- **`doctor` est cassé** : issue #465, il rapporte « healthy » sur un projet jamais installé. À reconstruire autour de la question « pourquoi mon outil ne voit pas le framework ».
- **Découpage de `framework/application`** entre `flows/` et `cases/`, validable seulement une fois les 14 fichiers de `shared/` redescendus.
- **Placement de `errors.ts`** (457 loc) dans le kernel, ou découpé par contexte avec la seule classe de base en commun.
- **`ARCHITECTURE.md` est périmé** : il documente `marketplaces` dans le manifest v6 alors que `manifest.ts:142` indique que le registre vit dans `.aidd/marketplaces.json`.
- **Répercussions sur les rules, skills et `aidd_docs`**, non traitées.

## Prochain pas

Revoir le nommage des commandes sur le découpage en quatre, puis répercuter sur les rules, les skills et `aidd_docs`.

## Répercussion sur les règles, skills et mémoire

### Ce qui est fait
- Les invariants applicables aujourd'hui sont devenus des règles auto-porteuses, une par sujet, scopées à des paths logiques : `0-dependency-direction`, `0-ports-adapters`, `0-use-case`, `0-domain-model`, `0-orchestration`, `0-shared-modules`. Le non-ré-export a rejoint `01-standards/1-exports.md`, sa catégorie.
- `0-layer-responsibilities.md` couvrait quatre sujets et légitimait le dépotoir (*« Shared Use Cases: only called from other use-cases »*). Scindé en `0-use-case` et `0-domain-model` ; sa section Sub-use-cases est remplacée par `0-shared-modules`, ses sections Port et Adapter par `0-ports-adapters`, son « Methods ≤ 20 lines » retiré car `06-design-patterns/6-method-size.md` le portait déjà.
- `0-hexagonal.md` supprimé : c'était une carte, et `aidd_docs/memory/codebase-map.md` en contient déjà une plus riche.
- `0-file-ownership` déplacé en mémoire (`architecture.md`) : c'est une décision de conception, pas une contrainte d'écriture, et elle était chargée sur tout `src` pour une poignée de fichiers.
- `0-launchers` supprimé des règles : un seul lanceur existe. Le sujet ira dans la skill du contexte concerné.

Test appliqué : une règle empêche une violation au moment où on écrit ; ce qui décrit l'existant va en mémoire ; ce qui est une marche à suivre va en skill.

Règles chargées sur `src/**/*.ts` : 7, contre 9 avant l'opération.

### Reste à faire
- Les skills, une par contexte (`translate`, `tools`, `distribution`, `framework`) plus les transversales `test` et `audit-remediate`. Elles décrivent la cible, donc elles attendent que le code ait bougé. Les dix skills actuelles encodent la taxonomie par couche et seront remplacées, pas mises à jour.
- Le sujet « lanceur » (localiser puis exécuter, ne pas embarquer) rejoindra la skill du contexte qui portera kanban, telemetry et governance.
- `1-exports.md` interdit tout `index.ts` ; cela contredira l'invariant cible « un contexte expose une seule entrée publique ». Distinguer le barrel de confort de la frontière de contexte au moment du déplacement.
- `codebase-map.md` (93 l., 32 réfs) et `architecture.md` (143 l., 16 réfs) se réécrivent une fois le code déplacé, pas avant.
- `ARCHITECTURE.md` est faux dès aujourd'hui sur le manifest v6.
