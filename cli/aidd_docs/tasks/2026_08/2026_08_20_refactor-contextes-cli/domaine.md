# Domaine — état actuel et cible

## Test d'acceptation

**Ajouter un sixième outil doit toucher un fichier et une ligne d'enregistrement.**
Mesurable avant et après. Aujourd'hui : huit endroits.

| # | Fichier | Ce qu'on y ajoute |
|---|---|---|
| 1 | `domain/tools/ai/<tool>.ts` | le profil, avec `registerTool()` en bas |
| 2 | `domain/models/tool-ids.ts` | union `AiToolId` + tableau `AI_TOOL_IDS` |
| 3 | `domain/models/plugin-format.ts` | union `PluginFormat` |
| 4 | `domain/models/framework-build.ts` | union `FrameworkBuildTarget` + `FRAMEWORK_BUILD_TARGET_MODES` |
| 5 | `strategies/tool-contracts.ts` | `build<Tool>Contract()` et sa variante flat |
| 6 | `infrastructure/deps.ts` | import à effet de bord + entrée du registre de build |
| 7 | `infrastructure/assets/asset-loader.ts` | import de la config embarquée |
| 8 | `assets/configs/<tool>/` | le fichier de config |

## Défauts mesurés

### Manifest est une façade, pas un agrégat
529 lignes, 28 méthodes publiques, six responsabilités : outils, fichiers tracés, fichiers
fusionnés, exclusions MCP, plugins, sérialisation. Aucune ne peut évoluer sans rouvrir le
même fichier.

### L'évolution du format de persistance vit dans l'entité
Cinq fonctions `migrateV1toV2` … `migrateV5toV6`, plus des champs conservés pour le seul
aller-retour legacy. Commentaire ligne 89 : « This migration block must remain until all
users have upgraded past v1. » **Décision : les migrations par version sont supprimées, pas
déplacées.**

### Obsession du primitif là où l'objet-valeur existe déjà
`FileHash` est un vrai objet-valeur avec `equals()`. `Plugin` porte pourtant trois
`ReadonlyMap<string, string>` de sens différents, distingués par un commentaire :
chemin → empreinte, chemin installé → chemin de composant, nom de serveur MCP → MD5.
Le compilateur voit le même type dans les trois cas.

### Trois unions parallèles, membres identiques
Mesuré : `AiToolId`, `PluginFormat` et `FrameworkBuildTarget` ont exactement les mêmes cinq
membres, dans un ordre différent. `vscode` n'est dans aucune des deux dernières, ce qui est
correct. Aucune divergence réelle ; trois listes synchronisées à la main, sans vérification.

### Duplication confirmée et déjà dérivée (issue #468)
Quatre `install-*-use-case` (325 loc) implémentent le même pipeline ; quatre classes de
capacité dupliquent la même surface de huit méthodes. La dérive est arrivée :
`AgentsCapability.acceptsFileName` reçoit sa liste de suffixes de l'extérieur là où les trois
autres la calculent en interne — même contrat, deux implémentations incompatibles.

### Un seul vrai cas particulier en dur
Sur 7 comparaisons d'identifiant d'outil, 5 sont dans la branche morte `loadForeign`.
Restent `cursor-hooks.ts:11` et surtout
`built-tree-materialization-translator.ts:62` : `toolId === "opencode" ? "flat" : "marketplace"`,
qui redérive par le nom ce que le profil déclare déjà (`mode: "flat"`).

## Cible

- **Un outil, un fichier.** Le profil porte ses capacités **et** son contrat de build.
  `tool-contracts.ts` (820 loc, 9 fonctions) disparaît, réparti sur les profils.
- **Un mode par outil**, déclaré dans le profil. `FRAMEWORK_BUILD_TARGET_MODES` et ses neuf
  cellules deviennent dérivés ; `framework-build.ts` ne garde que `FrameworkBuildMode`.
- **Une union source.** `PluginFormat` et `FrameworkBuildTarget` deviennent des alias ou des
  sous-ensembles explicites d'`AiToolId`, gardant le vocabulaire sans dupliquer les valeurs.
- **Manifest devient un agrégat racine à membres séparés** : `ToolEntry` porte `TrackedFiles`,
  `MergeFiles`, `McpExclusions`, `InstalledPlugin[]`. Une sauvegarde, un invariant, un fichier
  par responsabilité. À faire pendant le déplacement vers le contexte `framework`.
- **Les trois maps sont typées** : `Map<InstalledPath, FileHash>`,
  `Map<InstalledPath, ComponentPath>`, `Map<McpServerName, ContentDigest>`.
- **Renommage par l'intention** : `InstalledPlugin` pour l'enregistrement, `PluginOffer` pour
  l'entrée de catalogue, `PluginPayload` pour la charge utile téléchargée. Chaque contexte
  parle alors de son propre « plugin » sans ambiguïté.
- **Le domaine de chaque contexte est non anémique** : les invariants sont validés dans le
  modèle, pas dans les use cases.
- **Suppression du dernier cas particulier** : lire `mode` sur le profil au lieu de comparer
  l'identifiant à `"opencode"`.
