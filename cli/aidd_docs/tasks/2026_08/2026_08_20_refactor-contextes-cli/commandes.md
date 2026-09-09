# Surface de commandes cible

## Grammaire

Règle unique, observée sans exception chez Claude Code et Codex :

- **Verbe nu** = une action exécutée maintenant. Le sujet implicite est le CLI ou le projet courant.
- **Nom puis verbe** = le cycle de vie d'une ressource gérée.

Claude : `doctor`, `update`, `install`, `import` sont des actions ; `plugin install`,
`plugin marketplace add`, `mcp`, `agents` sont des ressources.
Codex : `exec`, `review`, `apply`, `update`, `doctor`, `login` sont des actions ;
`plugin add`, `plugin marketplace` sont des ressources.

## Surface

```
# ACTIONS — verbe nu
aidd setup                              installe AIDD dans le projet
aidd clean                              retire AIDD du projet
aidd doctor    [--tool ...]             outils détectés, équipés, plugins, problèmes
aidd sync      [--tool ...]             régénère les fichiers possédés, piloté par le manifest
aidd translate <source> --to <outils>   convertit une source, sans cycle de vie
               [--out <dir>] [--as marketplace|flat]
aidd update|upgrade                     met à jour le CLI lui-même
aidd login | aidd logout

# RESSOURCES — nom puis verbe
aidd framework   install | update | remove          [--tool ...]
aidd plugin      install | update | remove | list | search   [--tool ...]
aidd marketplace add | refresh | remove | list

# APPLICATIONS DE L'ÉCOSYSTÈME — ressources, verbes selon leur nature
aidd kanban      open | list          open par défaut
aidd telemetry   enable | disable | status
```

Environ 22 commandes feuilles contre 34 aujourd'hui, et `--tool` est le flag unique de portée.

## Suppressions et fusions

| Aujourd'hui | Devient | Pourquoi |
|---|---|---|
| `ai` et `ide` (7 verbes identiques chacun) | flag `--tool` | Un outil n'est pas une ressource gérée, c'est la dimension de portée. `tool add cursor` était déjà `framework install --tool cursor` : `InstallAiToolUseCase` fait config runtime + plugins + settings + manifest. |
| `status`, `ai status`, `ide status`, `ai doctor`, `ide doctor`, `plugin doctor` | `aidd doctor` | Les deux appelaient `detect-plugin-drift` sur les mêmes fichiers, avec deux vocabulaires. Ni Claude ni Codex n'ont de `status`. |
| `restore`, `ai restore`, `ide restore` | `aidd sync` | `restore` portait le nom du cas de secours pour le geste quotidien. `sync` est déjà le mot de `ARCHITECTURE.md` et de #592. |
| `self-update` | `aidd update` | `update` sans sujet signifie « le CLI » chez Claude comme chez Codex. |
| `framework build` | `aidd translate` | Mesuré identique : `build` prend un `sourceDir`, un `outDir` et un mode (`--flat` = *materialize directly into project workspace*). C'est `translate` avec la source figée. |
| `plugin create` | supprimé | Personne n'écrit de plugin tiers ; la commande n'est documentée nulle part. |
| `aidd sync` (documenté, inexistant) | existe enfin | `ARCHITECTURE.md:58` l'annonce, aucune déclaration ne correspond. |

## Kanban et telemetry ne sont pas une catégorie à part

Ce sont deux ressources dont la nature appelle des verbes différents : telemetry est un réglage
persistant (`enable`/`disable`), kanban est une application qu'on ouvre (`open`).

`aidd kanban` respectait déjà la grammaire : `commands/kanban.ts` enregistre `list` et
`interactive` avec `isDefault: true`. Le verbe est simplement rendu explicite et renommé `open`.

Pas de `start`/`stop` : vérifié, `kanban/src` ne contient ni `listen`, ni `server`, ni `daemon`,
ni `spawn`, ni `pid`. C'est un `render()` d'ink au premier plan, que l'on quitte. Une commande
`stop` n'aurait jamais rien à arrêter. Le couple `start`/`stop` sera en revanche le bon pour la
gouvernance si son sas est un service qui tourne — c'est le cas que Codex traite avec
`remote-control`, « Manage the app-server daemon ».

## Divergences assumées avec l'écosystème

- **`marketplace` reste au niveau racine**, alors que Claude et Codex l'imbriquent sous `plugin`.
  Raison de domaine : chez eux un marketplace ne sert que des plugins ; ici il porte **aussi le
  framework** (`FRAMEWORK_MARKETPLACE_NAME` y est enregistré). L'imbriquer mentirait sur son contenu.
- **Alias systématiques**, comme chez eux : `install|i`, `remove|rm`, `update|upgrade`,
  `plugin|plugins`. Évite d'avoir à trancher le débat du bon mot.

## Adjacences à documenter d'une phrase chacune

Elles ne sont pas des doublons, mais elles se ressemblent assez pour être confondues.

- `marketplace refresh` re-télécharge les catalogues.
- `framework update` passe à une nouvelle version.
- `sync` réécrit les fichiers possédés à partir de ce qui est déjà là.
- `translate` convertit une source arbitraire sans rien enregistrer ; `sync` fait la même
  conversion mais pilotée par le manifest, donc avec cycle de vie.
- `setup` amorce le projet entier (marketplace + framework + outils + plugins) ;
  `framework install` n'agit que sur le framework.
- `clean` retire tout AIDD du projet ; `framework remove` ne retire que le framework.

## Encore ouvert

- **`doctor` doit gagner l'inventaire des outils**, ce qu'il ne fait pas aujourd'hui. C'est un
  ajout, pas un renommage — et il est de toute façon à refaire (#465 : il rapporte « healthy »
  sur un projet jamais installé).
- **`enable`/`disable` distinct d'`install`/`remove`** existe chez Claude : un plugin installé
  mais désactivé est un état réel qu'AIDD ne modélise pas. À évaluer.
