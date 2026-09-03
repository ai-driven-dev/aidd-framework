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

Aucun des deux dossiers de test n'était au-dessus de la limite (7 et 10). Ce n'est donc pas un
gain de compte, c'est un gain de lisibilité : le test se trouve là où se trouve ce qu'il teste.
Le dire ainsi évite de rejouer exactement le défaut qu'on corrige.

## Test

```sh
git diff -M -- tests/contexts tests/kernel | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -cvE '(import|from ")'
```

`0` — aucune ligne modifiée hors import. Déplacement pur.
