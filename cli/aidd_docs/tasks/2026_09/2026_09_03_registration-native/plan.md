---
objective: "The CLI stops carrying a second way to register a marketplace, and its contract stops promising one."
status: implemented
---

# Plan: Leave the registration to the tools that do it

## The decision this closes

Phase 4 of the uncovered-mutants work found 75 mutants in a branch no shipped profile takes,
and refused to write tests there: retire it or keep it is a decision about tool profiles, not
a question a mutation report answers.

The decision is to retire it, on the rule phase 5 of the context refactor already set —
drive the tool's own command where it offers one, and do not rebuild badly what it does well.

`syncMarketplacesFile` had two paths. One drove nothing and wrote the tool's settings file
itself, merging a marketplace entry into whatever was already there. The other returned
early, leaving the registration to the tool's CLI. Established by running the condition over
the five registered profiles: **all five take the early return**. claude, copilot and codex
declare a native plugin CLI; cursor and opencode declare no marketplace settings at all.

## What was checked before removing anything, and why that list is the point

Deleting a path the tool covers is right. Deleting a path the tool does *not* cover is a
regression that no compiler catches. Two things survived that check:

| Kept | Because |
| ---- | ------- |
| `toEntry` | It is called from `mergeEnabledPlugins` too — the live path. Claude registers its own marketplaces but does **not** write `enabledPlugins`; this CLI does, and the existing test says so (`enablesPlugins: false`). Removing it with the merge would have broken plugin activation |
| The marketplace build | `builtSourcesForTool` returned a map that only the merge read, but the build itself must happen whoever registers — including on a machine where the tool's CLI is absent and activation stops short. It became `buildAllForTool`, which builds and returns nothing |

## The contract narrowed with the code

`marketplacesSettingsPath` documented three answers. The first — `undefined`, "into
`settingsPath` alongside the rest" — described the era when this CLI wrote the registration
itself. It is now `string | null`.

`toEntry`'s array shape had no producer at all: the single entry builder returns a map. Gone,
with the `valueShape` discriminant that existed to tell the two apart.

A contract promising more than the code delivers is legacy wearing the costume of generality.

## Verified

| Path | Result |
| ---- | ------ |
| `setup` + `plugin install` + `sync`, five tools, tool CLIs **present** | identical — cursor 47 files, copilot 246, codex 48, opencode 46; claude identical but for the absolute path, which the tool writes itself |
| `setup` + `plugin install`, claude, tool CLI **absent from PATH** | identical, 247 files, built tree present on both sides |
| delete `settings.local.json`, then `marketplace refresh` + `doctor` | restored on both sides, identical but for the path |

The third is the one that mattered. `doctor` tells the user to run `aidd marketplace refresh`
to write the file back; had that recovery run through the deleted merge, `doctor` would have
started giving advice that no longer worked.

168 lines removed against 40 added, across three files.

## What this proof does not cover

`update`, `clean` and `framework remove` were not exercised. And a profile that dropped its
`nativeActivation` tomorrow would no longer have a registration written for it — that is the
decision, not an oversight, and it is why the contract now says so out loud.

The Windows path normalisation (`replace(/\\/g, "/")`) went with the merge. Nothing is lost,
its only consumer leaving with it, but it is written here rather than left to be discovered.

## Revue (2026-09-03)

Aucune régression trouvée : ni sur les cinq profils, ni sur `update`, `clean` et
`framework remove`, les trois chemins que ce dossier signalait comme non éprouvés. Le
relecteur les a suivis un par un — `aidd update` ne fait plus que la mise à jour du CLI,
`framework update` ne touche jamais cette classe, `clean` ne mentionne aucune clé de
réglages, et `MarketplaceRemoveUseCase` n'a jamais écrit d'entrée.

En revanche il a trouvé que le rétrécissement s'était arrêté trop tôt, et l'argument était
le mien.

**`entry.value` n'avait plus aucun lecteur.** Un seul `grep` le montre : la seule survivante
de `toEntry` lit `entry.key` et rien d'autre. Derrière, toute une chaîne devenait écriture
pure — `version` → `versionByName` → `loadAllVersions` → `loadCatalogVersion`, une lecture
asynchrone du catalogue par marketplace et par synchronisation, dont le résultat était jeté.
J'avais retiré `valueShape` en écrivant qu'un contrat promettant plus que ce que le code
tient est du legacy déguisé en généricité, et laissé debout une instance plus grosse.

`toEntry` devient `toEntryKey` : une clé, ou `null`. Le `null` était la partie porteuse — il
empêche d'écrire une entrée pour une source que l'outil ne sait pas exprimer, et garde les
plugins qui en viennent hors de la carte des plugins activés. Partent avec : le type
d'entrée, `version`, les deux chargeurs de catalogue, et le port `PluginCatalogRepository`
que cette classe n'a plus de raison de recevoir.

Trois autres, tous réels et tous laissés par mon propre rétrécissement : une garde
`marketplacesSettingsPath === undefined` devenue inatteignable, un commentaire de `doctor`
décrivant trois cas dont un n'existe plus, et `enabledPluginsSettingsPath`, champ sans
producteur — la justification exacte qui avait fait retirer `valueShape`.

### Le test qui a failli ne rien prouver

La revue notait que la raison de garder le build n'était épinglée par aucun test. Le premier
que j'ai écrit passait **aussi avec le build supprimé** : l'activateur factice avait
`enablesPlugins: false`, donc `toRegister` valait toutes les marketplaces et l'autre chemin
construisait tout de toute façon.

Le cas non redondant est celui qu'un outil dont la CLI active les plugins présente : il ne
déclare que les marketplaces qu'un plugin utilise, donc une marketplace sans plugin est
construite là ou nulle part. Option câblée dans le harnais, et la suppression du build fait
maintenant tomber le test.

Sans cette correction, j'aurais commité un test qui prouve zéro — la forme même du défaut que
cette séquence entière a passé son temps à corriger.

