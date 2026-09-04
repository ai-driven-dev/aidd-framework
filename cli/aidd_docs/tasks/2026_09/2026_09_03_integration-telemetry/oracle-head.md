# Oracle : la branche avant la fusion

Releve pris sur `HEAD` (`37348891`), dans un worktree detache, avant la fusion de `origin/next`.

```
suite complete de HEAD    2054 tests, tous verts
  unit          1443   (697 fichiers)
  integration    453   (248 fichiers)
  e2e            104   ( 33 fichiers)
  architecture    54   ( 35 fichiers)

suite complete apres      3240 noms distincts, tous verts
```

Les quatre etages ont tourne des deux cotes. Un etage qui ne collecte rien compte zero, et
laisserait ce diff muet sur tout ce qu'il contient - d'ou les comptes par etage.

Chaque nom de test de HEAD doit se retrouver apres la fusion. Un `describe` renomme est
un deplacement ; un test absent sans raison est une regression.

## Les 19 noms absents, et pourquoi

| Test | Sort |
| ---- | ---- |
| `Cursor plugin.files tracking enables uninstall of hooks.json and mcp.json (Phase 2) Plugin.files keys join to the exact written absolute paths (uninstall can find the files)` | **Supersede.** Meme test sous « ... enables uninstall of mcp.json; hooks.json is out-of-band (Phase 6) ». |
| `FlatOutputStrategy integration AC #11: unsupported hooks warn-and-skip (opencode contract) warns and skips hooks for a hooks-bearing plugin when hooks is unsupported` | **Supersede.** Le contrat plat d'OpenCode declare `hooks: supported` ; `build-hooks-support-declaration.unit.test.ts` tient les deux declarations ensemble. |
| `PluginAddUseCase OpenCode hooks skip (Phase 3) emits exactly one logger.warn for hooks skip` | **Supersede.** Meme changement : il n'y a plus de skip a signaler. |
| `PluginAddUseCase OpenCode hooks skip (Phase 3) writes no hooks/ files to the project when plugin has hooks` | **Supersede.** OpenCode accepte les hooks depuis la phase 7 de `next` — mesure, pas preference. `plugin-add-opencode-hooks-install.integration.test.ts` affirme l'inverse. |
| `PluginAddUseCase skip warnings when adapter returns skip entries emits one logger.warn per skip entry with the expected format` | **Renomme.** Survit sous « warn message format formats skip warnings as Plugin <name>: <component> skipped for <toolId> — <reason> ». |
| `PluginAddUseCase skip warnings when adapter returns skip entries emits one warning for hooks skip when plugin ships hooks against opencode` | **Supersede.** Devient « emits no logger.warn — OpenCode delivers sample-plugin's hooks instead of skipping them », dans le meme fichier. |
| `PluginContentTranslator skip list flat mode (opencode) emits no skip entry per file — exactly one entry per plugin regardless of hooks file count` | **Supersede.** Comptait les entrees d'une liste desormais vide. |
| `PluginContentTranslator skip list flat mode (opencode) returns one skip entry when plugin has hooks (hooks not accepted by flat mode)` | **Supersede.** Remplace dans le meme fichier par « returns no skip entry when plugin has hooks — OpenCode now accepts them ». |
| `PluginInstallUseCase source arg routing delegates to PluginInstallFromMarketplaceUseCase when arg is a plugin name` | **Renomme.** Le collaborateur est desormais typé par l'interface etroite que son module exporte : « ... delegates to PluginInstallFromMarketplace ... ». |
| `PluginsCapability flat mode exposes flatNamespacePrefix` | **Renomme.** Idem. |
| `PluginsCapability flat mode exposes mode as flat` | **Renomme.** Le `describe` « flat mode » se scinde en « flat mode, hooks unsupported » et « flat mode, hooks accepted ». Les cinq assertions sont intactes. |
| `PluginsCapability flat mode pluginManifestRelativePath is null` | **Renomme.** Idem. |
| `PluginsCapability flat mode pluginOutputDir returns null` | **Renomme.** Idem. |
| `PluginsCapability flat mode pluginsDir is null` | **Renomme.** Idem. |
| `install cursor plugin with hooks and mcp (Phase 2) emits no skip warnings for hooks or mcp` | **Supersede.** Repris tel quel par la phase 6. |
| `install cursor plugin with hooks and mcp (Phase 2) rewrites ${CLAUDE_PLUGIN_ROOT}/ to ./ in hook commands` | **Supersede.** Meme changement de destination ; la reecriture vise maintenant `.cursor/hooks/<plugin>/`. |
| `install cursor plugin with hooks and mcp (Phase 2) tracks hooks.json and mcp.json in Plugin.files for uninstall` | **Supersede.** `hooks.json` n'est plus sous le baseDir du plugin, donc plus dans `Plugin.files` — affirme a l'envers par la phase 6. |
| `install cursor plugin with hooks and mcp (Phase 2) writes converted hooks.json at plugin root with camelCase events` | **Supersede.** Trois sondes ont mesure qu'un `hooks.json` plugin-scope ne declenche rien chez Cursor : `hooksDestination: \"project\"` l'ecrit desormais dans `.cursor/hooks.json`, ce que la phase 6 affirme. |
| `install cursor plugin with hooks and mcp (Phase 2) writes mcp.json at plugin root with the source content unchanged` | **Supersede.** Repris tel quel par la phase 6, qui affirme la meme chose sur le meme fichier. |

Aucun test de HEAD n'a disparu sans raison : douze sont remplaces par l'affirmation
inverse, mesuree sur le vrai outil, et sept portent un nom neuf pour le meme corps.
