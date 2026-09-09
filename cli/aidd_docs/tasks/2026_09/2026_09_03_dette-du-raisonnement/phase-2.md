# Phase 2 — L'arbre de test suit l'arbre de source

status: done

## Le défaut

Le commit `224deafa` disait fermer ceci : « trois classes de capacité posées à côté du dossier
qui tient les cinq autres — même suffixe, même rôle, deux emplacements, aucune raison écrite ».
Après le commit, la phrase restait vraie mot pour mot de l'arbre de test.

`folder-size` ne l'a pas vu parce qu'il ne mesure que `src/` : `sourceFiles()` marche sur
`join(CLI_ROOT, "src")`. Le défaut n'a pas été supprimé, il a été déplacé hors de l'arbre
mesuré.

## L'option écartée, et pourquoi

Étendre `sourceFiles()` à `tests/` était l'autre réponse. Mesure faite avant de choisir :

```
17 tests/helpers/ports
17 tests/contexts/framework/application
15 tests/architecture
14 tests/contexts/framework/application/framework/translator
13 tests/e2e
11 tests/kernel
11 tests/contexts/framework/application/plugin
```

Sept dossiers au-dessus de la limite. Le socle passerait de deux entrées à neuf, dans une
session dont la règle est qu'un socle ne fait que rétrécir. Écarté.

## Ce qui bouge

Neuf fichiers de test, en miroir des déplacements de source :

- `tests/contexts/tools/domain/{mcp,plugins,settings}-capability.unit.test.ts` → `capabilities/`
- `tests/…/install/install-{agents,commands,rules,skills}-use-case.unit.test.ts` → `content/`
- `tests/kernel/{flat-paths,relative-link-rewrite}.unit.test.ts` → `materialization/`

Trois dossiers parents, pas deux, et il faut le dire précisément parce que la version
précédente de cette phrase disait le contraire de sa propre liste :

| Parent | avant | après |
| ------ | ----: | ----: |
| `tests/contexts/tools/domain` | 7 | 7 |
| `tests/…/application/install` | 10 | 6 |
| `tests/kernel` | **11** | 9 |

Deux des trois étaient sous la limite : pour ceux-là le gain est de lisibilité, le test se
trouvant là où se trouve ce qu'il teste. Le troisième, `tests/kernel`, était à onze — il figure
deux paragraphes plus haut, dans la liste même des sept dossiers au-dessus de la limite. Sous
l'hypothèse écartée, le déplacer l'aurait sorti du socle : pour ce dossier-là, c'est bien un
gain de compte.

Rien n'a été truqué, puisque aucun ratchet ne mesure `tests/`. Mais la phrase qui défendait ce
déplacement contre l'accusation de fausse mesure était elle-même une fausse mesure, et elle
contredisait un tableau imprimé au-dessus d'elle.

## Test

```sh
git diff -M -- tests/contexts tests/kernel | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -cvE '(import|from ")'
```

`0` — aucune ligne modifiée hors import. Déplacement pur.
