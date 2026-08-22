# Mesures — état actuel du CLI

Toutes les mesures ci-dessous sont reproductibles sur la base de code au 2026-08-20.

## Volumétrie

| Ensemble | Fichiers | Lignes |
|---|---|---|
| `src/` | 253 | 22 806 |
| tests | 201 | 32 811 |
| dont unit | 139 | 20 281 |
| dont integration | 47 | 8 952 |
| dont e2e | 15 | 3 578 |

Aucun test colocalisé dans `src/` ; l'arbre `tests/` est un miroir des chemins.

## Localité par contexte candidat

1 252 arêtes d'import internes, 45 % intra-contexte.

| Candidat | intra | sortantes | entrantes |
|---|---|---|---|
| framework (build) | 8 | 51 | 5 |
| marketplace | 1 | 56 | 12 |
| tools | 14 | 68 | 55 |
| plugin | 96 | 136 | 146 |
| install et satellites | 34 | 259 | 36 |
| noyau (models, ports, adapters, commands) | 418 | 111 | 427 |

## Glissements de sens — un mot, plusieurs types

| Mot | Sens | Type |
|---|---|---|
| plugin | ce qu'on écrit | `plugin-scaffold.ts` |
| plugin | offre de catalogue | `PluginCatalogEntry` |
| plugin | offre d'un écosystème étranger | `NormalizedPlugin` |
| plugin | charge utile téléchargée | `PluginDistribution` |
| plugin | enregistrement installé | `Plugin` |
| marketplace | source enregistrée | `Marketplace` / `MarketplaceEntry` |
| marketplace | fetch caché | `MarketplaceCacheEntry` |
| marketplace | format de fichier émis | `formats/*-marketplace.ts` |
| tool | cible de build | `FrameworkBuildTarget` |
| tool | surface installée | `AiToolId` + `tools/registry.ts` |
| scope | project/user pour installer | `InstallScope` |
| scope | project/user pour le registre | `MarketplaceScope` |

Trois erreurs distinctes coexistent pour le dernier cas : `InvalidInstallScopeError`, `InvalidPluginScopeError`, `InvalidMarketplaceScopeError`.

## Propriété des états persistés

| Store | Propriétaire |
|---|---|
| `.aidd/manifest.json` | `ManifestRepositoryAdapter` |
| `.aidd/marketplaces.json` | `MarketplaceRegistryAdapter` |
| `.aidd/cache/trusted-marketplaces.json` | `MarketplaceTrustStoreAdapter` |
| `.aidd/cache/marketplaces/<name>` | `MarketplaceCacheAdapter` |
| `.aidd/cache/built/<name>/<target>` | cache de build |
| `.claude/ .cursor/ .github/ …` | adapter fichier, tracé via le manifest |

`manifest.ts:142` : le registre marketplace a quitté le manifest v6 et vit dans `.aidd/marketplaces.json`. `ARCHITECTURE.md` documente encore l'ancienne forme.

## Cycles internes — les deux sont cassables

- `formats/command.ts` → `tools/contracts.ts` : deux types seulement, `UserFileSection` (ligne 11) et `UserFileSectionKey` (ligne 13). Import type-only.
- `capabilities/{rules,commands,skills}` → `tools/registry` : cycle accidentel via ré-export barrel. `AI_TOOL_IDS` est défini dans `models/tool-ids.ts` et ré-exporté par `registry.ts` ligne 21. Trois imports à repointer sur la source.

## `use-cases/shared/` — 2 fichiers sur 14 sont partagés

| Fichier | Appelants | Verdict |
|---|---|---|
| `resolve-marketplace` | 9 | partagé |
| `ensure-built-marketplace` | 5 | partagé |
| `resolve-update-decision` | 4 | interne |
| `update-one-tool` | 4 | interne |
| `post-install-pipeline` | 3 | interne |
| `gitignore` | 3 | interne |
| `apply-plugin-files` | 3 | interne |
| `detect-plugin-drift` | 2 | interne |
| `restore-drift-entries` | 2 | non partagé |
| `fetch-marketplace-source` | 1 | non partagé |
| `generate-tool-distribution` | 1 | non partagé |
| `resolve-restore-decision` | 1 | non partagé |
| `restore-merge-files` | 1 | non partagé |
| `restore-regular-files` | 1 | non partagé |

## Use cases — 78 fichiers pour 34 commandes feuilles

45 déclarations `.command()` dont 11 groupes parents. Trois natures sous un seul suffixe : vrais use cases adossés à une commande ; étapes et politiques que personne ne demande (~15) ; interaction, qui est de la présentation (`setup-tools-prompt`, `setup-plugins-prompt`, `plugin-pick`, `sync-conflict-resolver`, `project-context-detector`, `menu-use-case` 366 loc).

Six dépassent la règle d'une responsabilité : `marketplace-sync-settings` 479, `menu` 366, `plugin-add` 307, `status` 219, `restore` 218, `uninstall-tools` 214.

## Frontières mal placées

- `use-cases/plugin/translator/` : 4 fichiers sur 6 importent `Manifest` et `Plugin`. C'est l'application de la traduction qui enregistre, donc `framework`, pas `translate`.
- `marketplace-check-use-case` diffe les catalogues contre `manifest.getPlugins(toolId)`.
- `marketplace-remove-use-case` supprime les fichiers de plugins puis appelle `manifest.removePlugin` et `manifestRepo.save`.
- `marketplace-sync-settings-use-case` (479 loc) écrit dans les fichiers de config d'outils.

Ces trois derniers sont des chapeaux, pas des use cases de `distribution`.

## Matérialiser ou pointer

`plugin-translator-factory.ts:35` décide : `installScope === "user" || translationMode === "flat"` → matérialisation.

| Outil | Mode | Mécanisme natif |
|---|---|---|
| claude | native, `.claude/plugins/`, translationMode marketplace | `extraKnownMarketplaces` |
| cursor | native, découverte plugin-locale, installScope user | plugin-local |
| copilot | native, `.github/plugins/`, `nativeActivation` | oui, avec réserves (copilot-cli#2249, #3088) |
| codex | native, `.codex/plugins/`, `nativeActivation` | user-global seulement |
| opencode | **flat**, préfixe `aidd-` | aucun |

Code spécifique au mode flat : 831 loc (`flat-build-strategy` 335, `flat-hooks-merge` 227, `mode-b-flat-materialization-translator` 186, `flat-paths` 83).
Coût de la surveillance d'écart : ~1 544 loc (`doctor` 457, `restore` 472, `restore-*` partagés 326, `status` 219, `detect-plugin-drift` 70).

## Découpage des capacités

| Capacité | Consommateurs | Contexte |
|---|---|---|
| agents, skills, commands, rules | `install-*-use-case` de contenu + profils d'outil | translate |
| hooks | `tools/contracts`, `codex`, `config-capability` | translate |
| settings | `install-ide-config`, `install-config`, `install-ide-tool`, `install-runtime-config`, `vscode`, `copilot` | tools |
| mcp | `install-config`, helpers de plugin, translator flat | tools |
| plugins | translator + `marketplace-sync-settings` | scindée |

## Code mort

- Un seul fichier inatteignable depuis `src/cli.ts` : `domain/models/marketplace-entry.ts` (103 loc), ignoré explicitement par `knip.json`.
- `loadForeign()` : atteignable, jamais appelée en production ; déclarée par le port, bouchonnée par trois tests.
- `mcp-exclusion.ts` : 3 exports utilisés sur 7. Les 4 autres sont couverts par `tests/domain/models/mcp.unit.test.ts` — du comportement mort protégé par des tests vivants.
- `buildMergeFileEntries`, `UpdateAiToolsInput/Result`, `UpdateIdeToolsInput/Result` : zéro usage, même interne.

## Comparaison Superpowers (obra/superpowers v6.3.0)

Un dossier `skills/` de markdown partagé, dix manifestes par hôte de 500 à 1 700 octets qui pointent dessus : `.claude-plugin`, `.cursor-plugin`, `.codex-plugin`, `.opencode`, `.devin-plugin`, `.hermes-plugin`, `.kimi-plugin`, `.pi/extensions`, `.agents/plugins`, `gemini-extension.json`. La ligne utile du manifeste Cursor est `"skills": "./skills/"`. Les scripts de 15 et 10 Ko ne traduisent rien : `sync-to-codex-plugin.sh` est un rsync avec exclusions qui pousse dans le registre d'OpenAI et ouvre une PR.

Limites de la comparaison : ils ne livrent que des skills et des hooks, soit les capacités qui ont convergé entre outils. AIDD livre huit natures, dont celles qui n'ont pas convergé. Et leur README impose une installation séparée par hôte, là où `setup` installe sur N outils d'un coup.

## Issue #592 — la direction produit

`feat(cli): project agents under .aidd/agents with materialize into tool trees` dit deux choses décisives :
- « Symlinking one file into every host tree fails when formats diverge and breaks drift/hash restore » — la matérialisation est la réponse assumée à la divergence des formats ;
- « Generated trees gitignored by default; CI/dev runs sync after checkout » — l'arbre généré est jetable, donc régénérable.

C'est le même mécanisme que le `translate` générique : une source canonique, convertie vers chaque cible installée.

## Enregistrer un marketplace : la CLI de l'outil ou son fichier de config ?

Trois façons de faire coexistent, pour la même opération.

| outil | mécanisme |
|---|---|
| copilot | `nativeActivation: { binary: "copilot" }` — pilote la CLI de l'outil |
| codex | `nativeActivation: { binary: "codex" }` — pilote la CLI de l'outil |
| **claude** | **écrit `.claude/settings.json` à la main** (`extraKnownMarketplaces`, `enabledPlugins`) |
| cursor | découverte plugin-locale, rien à enregistrer |

`claude plugin marketplace add|list|remove|update` existe, vérifié dans l'aide de Claude Code. AIDD
édite donc à la main le fichier de configuration privé d'un outil qui expose une commande officielle
pour ça — et ce fichier est **co-possédé** : c'est le seul fichier tracé du profil Claude, celui
dont la dérive est apparue en phase 1.

Le profil Copilot documente pourquoi il pilote la CLI : « Copilot treats enabledPlugins in
settings.json as a recommendation, not an auto-install (github/copilot-cli#2249) ». Autrement dit,
on est passé par la CLI **parce que le fichier ne suffisait pas**, pas par principe. Le profil Claude
ne porte aucun commentaire : le choix n'a pas été questionné.

**L'arbitrage.** Écrire le fichier fonctionne sans que l'outil soit installé ; piloter sa CLI exige
sa présence mais s'appuie sur un contrat public plutôt que sur un format de fichier privé qui peut
changer sans préavis. La dépendance est déjà acceptée pour deux outils sur quatre.

Décision produit, non tranchée.

### Uniformiser sur la CLI de l'outil : tenté, mesuré, abandonné pour Claude

Piloter `claude plugin marketplace add --scope project` a été implémenté puis retiré. Le golden a
dit pourquoi : l'empreinte de `.claude/settings.json` change et `status` rapporte le fichier
**modifié** là où il était en phase.

La cause est nette. Cette commande **écrit elle-même dans `.claude/settings.json`**, après qu'AIDD
l'a écrit et a enregistré son empreinte au manifest. Deux écrivains, un seul qui enregistre : le
projet signale une dérive permanente. Sans `--scope project` c'est pire encore — la commande vise le
**user scope par défaut** et enregistrerait le marketplace globalement, pour tous les projets de la
machine.

Codex et Copilot n'ont pas ce problème : leurs profils déclarent `marketplaceSettings: null` ou un
fichier que leur CLI ne réécrit pas. Ils sont pilotés parce que leur fichier de config **ne suffit
pas**, et le pilotage n'entre pas en conflit avec le suivi d'empreinte.

Ce que ça révèle, au-delà du cas : `.claude/settings.json` n'est pas co-possédé avec *l'utilisateur*
mais avec *l'outil*. Suivre l'empreinte d'un fichier qu'un autre programme réécrit légitimement
fabrique de la fausse dérive. C'est une troisième catégorie, à côté des fichiers possédés et
co-possédés, et le régime à lui appliquer n'est tranché nulle part.

### Cursor : sa CLI a évolué, mais pas dans le sens utile

`cursor-agent plugin marketplace add|list|remove|update` existe désormais. Vérifié : `add` prend une
**URL de dépôt git** et `list` liste ce qui est « visible to this account » — un concept hébergé,
indexé côté serveur. AIDD construit un marketplace **local** ; cette commande ne peut pas le
prendre. La matérialisation plugin-locale actuelle de Cursor reste la bonne approche.

## Activation native déclenchée pour un outil qui ne la déclare pas (2026-08-22)

`aidd marketplace add cc anthropics/claude-code` sur un projet claude affiche :

```
Warning: Native plugin activation — build 'cc' for claude skipped: ENOENT: no such file or directory,
open '…/.aidd/cache/marketplaces/cc/github-anthropics-claude-code-HEAD/plugins/plugin-dev/.claude-plugin/plugin.json'
```

Le profil claude n'a pas de `nativeActivation` — l'activation native ne devrait pas s'exécuter pour
lui. Le `bestEffort` l'a rattrapée, donc rien n'a cassé, mais la branche prise n'est pas la bonne.
Repéré en instruisant la phase 5, qui touche exactement ce chemin. Non corrigé : hors du périmètre
tranché ce jour.

## La suite smoke laisse des marketplaces derrière elle (2026-08-22)

`copilot plugin marketplace list`, hors de tout projet :

```
Registered marketplaces:
  • aidd-framework (Local: /private/var/folders/…/aidd-smoke-tools-XXXXXXXX.5XlhflGviM/proj.sxDyTW/.aidd/cache/built/aidd-framework/copilot)
```

Le répertoire n'existe plus. Les enregistrements de copilot sont **globaux à l'utilisateur**, pas au
projet, donc chaque exécution de la suite smoke en dépose un qui survit à la suppression du projet
temporaire. La suite est hermétique pour ce qu'elle écrit sous le projet, pas pour ce qu'elle fait
écrire aux outils. À corriger dans `scripts/smoke-tools.sh` : désenregistrer en fin de course.

## Copilot porte le même défaut de partage que claude (2026-08-22)

`.github/copilot/settings.json` reçoit lui aussi `extraKnownMarketplaces` avec des chemins absolus,
et il est committé. Mais le correctif n'a pas la même forme que pour claude : copilot n'a pas de
convention `settings.local.json` documentée, et la liste ci-dessus montre que son enregistrement
réel vit dans son magasin global — l'écriture du fichier projet est probablement redondante. Question
distincte, non traitée par la phase 5a.

## `update` ne synchronise pas les marketplaces (2026-08-22)

`MarketplaceSyncSettingsUseCase` est appelée par `setup`, `install`, `marketplace add/remove/refresh`
et `plugin install` — pas par `update`. Un projet dont le fichier de réglages de l'outil a dérivé
n'est donc pas remis d'aplomb par la commande que l'utilisateur associe naturellement à « remets-moi
à jour ». Antérieur à la phase 5, repéré en la vérifiant.

## Deux projets ne peuvent pas cohabiter dans le registre de copilot (2026-08-22)

Les enregistrements de copilot sont **globaux à l'utilisateur et clés par nom**, alors qu'AIDD
enregistre un arbre construit qui vit **dans un projet**. Un seul emplacement pour le nom
`aidd-framework`, donc le premier projet le prend et le garde. Quand son répertoire disparaît, tous
les autres projets cassent :

```
Native plugin activation — enable plugin 'aidd-vcs@aidd-framework' skipped:
  copilot plugin install aidd-vcs@aidd-framework failed: Failed to fetch marketplace:
  Local marketplace path does not exist: …/aidd-smoke-tools-XXXXXXXX…/built/aidd-framework/copilot
```

La logique de reprise existe pourtant — `registerMarketplace` tente `add`, et sur conflit
désenregistre puis réenregistre. Elle est bloquée un cran plus loin :

```
Cannot remove marketplace "aidd-framework".
Installed plugins from this marketplace: aidd-context, aidd-vcs, aidd-pm, …
Use --force to remove the marketplace and uninstall all its plugins.
```

Copilot refuse de désenregistrer un marketplace dont des plugins sont installés. Le `--force` qu'il
propose **désinstalle tous ces plugins**, y compris ceux que l'utilisateur aurait installés
lui-même depuis ce marketplace. C'est pour ça que le correctif n'est pas pris ici : il détruit
quelque chose qui ne nous appartient pas.

Forme proposée, à valider : lire le chemin actuellement enregistré, et ne reprendre l'emplacement
que s'il pointe vers un répertoire **qui n'existe plus** — un pointeur mort ne détruit rien. S'il
pointe vers un autre projet vivant, avertir avec la commande, ne pas voler. Cela demande une lecture
sur le port `NativePluginActivator`, ce que la tâche 2 de la phase 5 avait déjà anticipé.

Au passage, une affirmation du code était fausse et a été corrigée : le commentaire de
`registerMarketplace` disait que la CLI ne rejette `add` que pour une source différente. Mesuré,
copilot rejette tout doublon de nom : `Marketplace "aidd-framework" already registered`.

## Un marketplace de scope user atterrit dans le fichier d'un projet (2026-08-22)

`aidd marketplace add usr … --scope user` l'enregistre dans le registre utilisateur d'AIDD, puis la
synchronisation écrit son entrée dans `.claude/settings.local.json` **du projet courant** — vérifié.
Le scope d'AIDD décrit donc où AIDD s'en souvient, pas où l'outil l'apprend.

Claude accepte `--scope user` et écrit alors `~/.claude/settings.json` ; les trois autres n'ont pas
de scope du tout. Une réponse cohérente existe donc, mais elle ferait écrire AIDD dans le répertoire
personnel de l'utilisateur — exactement le genre d'écriture qui vient d'être retirée de la suite
smoke. Non prise sans arbitrage.

## Le port `listDirectory` ne tenait pas sa forme sous Windows (2026-08-22, corrigé)

`FileAdapter.listDirectory` renvoyait la sortie brute de `relative()`, donc séparée par des
antislashs sous Windows, alors que ses appelants comparent ces chemins à des chemins écrits avec des
`/` dans les profils et le manifest. Aucun test ne pouvait l'attraper : l'adaptateur en mémoire, lui,
a toujours produit des `/`, donc les deux implémentations divergeaient exactement là où personne ne
regardait. Le port déclare maintenant sa forme et l'adaptateur réel s'y tient.
