# Harnais et garde-fous déterministes

## Diagnostic

Les garde-fous existent déjà et n'ont jamais bloqué.

| Constat | Preuve |
|---|---|
| `knip` ne bloque pas | `cli-ci.yml` : `continue-on-error: true` sur le job `cli-knip` |
| `jscpd` ne bloque pas | idem sur `cli-jscpd`, et `pnpm jscpd` tourne sans seuil configuré |
| L'échappatoire a servi | `domain/models/marketplace-entry.ts` (103 loc, inatteignable) est listé dans `knip.json` `ignore` |
| La duplication est connue et tolérée | `jscpd` l'a détectée, elle est devenue l'issue #468, rien ne l'a bloquée |
| Aucun test d'architecture | aucun fichier de test ne vérifie direction de dépendance, frontière, cycle ou ré-export |
| Biome tourne à vide | `biome.json` n'active que `recommended: true` |

Une règle est un conseil, un test est une barrière. La dérive s'est produite **alors que les règles
existaient** : la politique `shared/` était écrite et a été suivie fidèlement jusqu'au dépotoir.

## Niveau 1 — Biome, sans dépendance ajoutée

Quatre règles natives couvrent quatre invariants.

| Règle | Groupe | Invariant couvert | Aurait attrapé |
|---|---|---|---|
| `noImportCycles` | suspicious | pas de cycle d'exécution | un vrai cycle, vérifié en en fabriquant un |
| `noReExportAll` | performance | un fichier n'exporte que ce qu'il définit | les 6 sites de ré-export, dont `registry.ts` et ses 8 symboles |
| `noBarrelFile` | performance | idem | idem |
| `noRestrictedImports` | style | frontières de contexte | toute arête latérale entre contextes |

**Correction mesurée.** `noImportCycles` **n'aurait pas attrapé** les deux cycles trouvés à la main.
Vérifié dans les deux sens : il signale un cycle fabriqué exprès, et ne dit rien du code réel. La
raison est que ces cycles se referment par des `import type` — `tools/contracts.ts` importe les
capabilities en type seulement, `registry.ts` importe `contracts` en type. Il n'y a donc **pas de
cycle à l'exécution**, et Biome a raison de se taire. Ce sont des cycles de conception, pas de
runtime : leur gravité avait été surestimée. La règle reste utile pour les vrais cycles ; elle ne
garde pas nos frontières.

Ce qui garde les frontières, c'est `noRestrictedImports` — stable depuis la 1.6, motifs façon
gitignore avec négation, message personnalisable, appliquée par dossier via `overrides`. Vérifiée
dans les deux sens : rien sur le domaine actuel, échec immédiat sur une violation volontaire.

Conflit à traiter le moment venu : `noBarrelFile` interdit tout barrel, alors que la cible veut un
`index.ts` par contexte. Résolution par `overrides` — règle active partout sauf
`src/contexts/*/index.ts`.

## Niveau 2 — Tests d'architecture

Cinq tests que ne couvre aucun outil du marché, parce qu'ils sont propres à ce domaine.

| Test | Ce qu'il assied | Aurait attrapé |
|---|---|---|
| `earned-sharing` | tout module partagé a des appelants dans ≥ 2 contextes | 12 des 14 fichiers de `use-cases/shared/` |
| `orchestrator-deps` | un chapeau ne dépend pas de plus de contextes qu'il n'en traverse | les 13 dépendances de `SetupUseCase` |
| `tool-addition-cost` | un identifiant d'outil n'apparaît que dans son profil et le kernel | les 3 unions parallèles et le `toolId === "opencode"` en dur |
| `docs-do-not-lie` | toute commande citée dans `ARCHITECTURE.md` et le README existe | `aidd sync` documenté et jamais déclaré ; `status --json` (#464) |
| `map-matches-tree` | l'arborescence de `codebase-map.md` correspond à `find src -type d` | la carte périmée, et la discipline manuelle qu'elle exige |

Les trois derniers transforment de la documentation en assertion exécutable. C'est ce qui empêche
la doc de redevenir fausse sans qu'on s'en aperçoive.

## État : niveau 2 livré

Les cinq tests existent, passent, et le cliquet a été vérifié en introduisant une violation
volontaire (un fichier neuf nommant `"cursor"` fait échouer `tool-addition-cost` ; son retrait
rend le vert).

```
tests/architecture/
  graph.ts                        lecture du source comme texte, graphe d'imports, cliquet
  earned-sharing.arch.test.ts     7 violations au cliquet
  orchestrator-deps.arch.test.ts  2 violations (setup 6 use cases, doctor 5), seuil > 4
  tool-addition-cost.arch.test.ts 20 fichiers nomment un outil hors profil
  docs-do-not-lie.arch.test.ts    0 violation après correction
  codebase-map.arch.test.ts       0 violation après correction
```

Projet vitest dédié `architecture`, script `pnpm test:arch`, exécuté en pre-commit via lefthook
(`cli-architecture`). Durée mesurée : **238 ms** pour les cinq fichiers. Les tests ne font que lire
des fichiers, ils n'importent jamais le code sous test, donc rien ne peut les casser par câblage.

### Deux mensonges corrigés au passage, trouvés par les tests eux-mêmes

- `ARCHITECTURE.md` annonçait `aidd sync` dans sa surface de commandes. Ligne retirée.
- `codebase-map.md` omettait six dossiers réels : `display`, `translator`, `auth`, `git`, `http`,
  et surtout `use-cases/framework/` avec son `strategies/` — soit 1 819 lignes, le plus gros dossier
  de use cases, absent de la carte. Ajoutés.

Le test `docs-do-not-lie` accepte une citation quand sa ligne marque la commande comme retirée,
en nie l'existence, ou est une ligne de tableau de migration associant l'ancienne à la nouvelle.
Pas de liste de noms à ignorer, qui deviendrait périmée le jour où une commande revient.

### Non vérifié

`pnpm lint` et `pnpm exec biome` échouent dans cet environnement avec « Linter process terminated
abnormally », y compris sur `--version` et hors bac à sable. Le binaire direct
(`./node_modules/.bin/biome`, version 2.5.8) fonctionne et ne remonte rien sur les nouveaux fichiers.
Le wrapper `pnpm exec` est en cause, pas Biome ni le code.

### Effet de bord révélateur

`pnpm typecheck` échouait sur `../kanban/src/**` tant que les dépendances de kanban n'étaient pas
installées : le typecheck du CLI dépend du `node_modules` d'un autre package, à cause de l'import
profond `../../../../kanban/src/…`. `lefthook.yml` documente déjà ce contournement dans
`cli-typecheck`. Argument supplémentaire pour le passage en lanceur.

## Niveau 3 — Politique d'échappatoire

- `continue-on-error` retiré de `cli-knip` et `cli-jscpd`.
- `jscpd` reçoit un seuil explicite et bloque au-delà.
- `knip.json` : `ignore` vide pour `src/`. Toute exception porte une raison et un numéro d'issue,
  et un test vérifie que chaque entrée est justifiée.

Une exception non justifiée fait échouer la CI. C'est le point qui manquait : les barrières
existaient, les exceptions n'étaient jamais relues.

## État : niveaux 1 et 3 livrés

### Niveau 1 — Biome

`biome.json` active `noBarrelFile`, `noReExportAll`, `noImportCycles` et `noUnresolvedImports`, plus
un `override` qui interdit au domaine d'importer `application` ou `infrastructure`. Version alignée
sur celle installée (2.5.8, le `$schema` annonçait encore 2.4.7).

506 fichiers vérifiés, zéro erreur. Une seule exception sanctionnée : `tests/helpers/**` est exempté
de `noBarrelFile` — c'est de l'infrastructure de test importée par 78 fichiers, délibérée et stable.

**Un vrai ré-export trouvé et supprimé** : `doctor-use-case.ts` réexportait deux fonctions de
`domain/formats/markdown-references.js`, uniquement pour qu'un test les importe à travers le use
case. Le code de production les importait déjà directement. Le test pointe désormais la source ; le
ré-export a disparu. Un test qui déformait la production.

### Niveau 3 — Échappatoires

- `continue-on-error: true` retiré des jobs `cli-knip` et `cli-jscpd`. Ils bloquent désormais.
- `jscpd` reçoit un seuil : `--threshold 3.5`, pour une mesure actuelle de **3,43 %** (71 clones,
  772 lignes dupliquées sur 22 507). Vérifié : échec à 3.0, succès à 3.5. Toute augmentation bloque.
- `knip` ne signale plus rien. Le helper des tests d'architecture a été nommé `helpers.ts` pour
  entrer dans le motif `tests/**/helpers.ts` déjà présent, plutôt que d'ajouter une exception.
- Reste dans `knip.json` `ignore` : `src/domain/models/marketplace-entry.ts`, qui disparaît en
  phase 1 du plan de migration. C'est la seule entrée, et elle a une date de péremption.

### Câblage

- CI : nouveau job `cli / Architecture invariants` lançant `pnpm test:arch`.
- pre-commit : `cli-architecture`, restreint aux chemins qui peuvent invalider un invariant.

## État de la mesure, vérifié le 2026-08-21

| Filet | Volume | Ce qu'il attrape |
|---|---|---|
| unitaire | 1 380 tests | domaine et use cases |
| intégration | 465 tests | adapters sur un vrai système de fichiers |
| e2e | 126 tests, 15 fichiers | le binaire réel |
| architecture | 6 tests, 238 ms | invariants, doc, carte, coût d'ajout d'un outil |
| smoke | 98 vérifications, 92 s | 36/36 commandes feuilles, hermétique |

**Couverture de code : 91,3 % / 88,1 % / 91,0 % / 91,3 %**, seuils configurés 85/80/90/85.

### Pourquoi la couche commandes est exclue de la couverture

Elle l'était sans raison écrite. Vérifié : l'inclure fait tomber le total de 91,3 % à 82,0 % et
affiche `cli.ts` à **0 %** et `commands/` à **0,69 %** — alors que 126 tests e2e et 98 vérifications
smoke les exercent. Les deux lancent `dist/cli.js` en **sous-processus**, et la couverture v8 ne
traverse pas une frontière de processus. Les inclure produit un faux zéro, pas une mesure.
L'exclusion est conservée, avec cette raison désormais écrite dans `vitest.config.ts`. Leur filet
réel est l'e2e et le smoke, comptés à part.

### Stryker : le premier blocage est levé, le second est diagnostiqué

`tsconfigFile: ""` supprime le crash `TypeError: ts.parseConfigFileTextToJson is not a function` :
c'est le préprocesseur TSConfig de Stryker qui appelait une API que TypeScript 7 n'expose plus.

Il atteint désormais son run initial et échoue plus loin, pour une autre raison : son runner lance
vitest, qui prend `vitest.workspace.ts` et exécute donc l'e2e — et le golden de build ne survit pas
au bac à sable de Stryker, où les chemins absolus diffèrent. Les options `vitest.dir`,
`vitest.related` et un fichier de configuration dédié ont été essayés : aucune ne restreint le run
initial. Le déblocage demande d'empêcher Stryker d'utiliser le workspace, ce qui n'a pas été fait.

Reste donc utile pour la phase 14, avec un obstacle nommé au lieu d'un « cassé ».

## Placement

| Moment | Ce qui tourne | Pourquoi |
|---|---|---|
| pre-commit (lefthook) | biome (lint + format) et les tests d'architecture | ils ne font que lire des fichiers, donc c'est rapide, et le retour arrive là où il coûte le moins cher |
| CI | typecheck, lint, unit, integration, e2e, golden, knip, jscpd, budget de bundle | le complet, y compris ce qui est lent |

Le pre-commit doit rester rapide : un hook lent finit contourné par `--no-verify`.

## Le reste du harnais

- **Règles** : les six règles d'architecture issues des invariants, plus les trois invariants cibles
  ajoutés une fois qu'ils sont vrais (chaîne des contextes, `kernel`, entrée publique unique).
- **Mémoire** : `codebase-map.md` et `architecture.md` réécrits, et la carte devient vérifiée par
  test plutôt que maintenue à la main.
- **Skills** : une par contexte, qui répond à « où ça va » en s'appuyant sur les invariants plutôt
  qu'en les répétant.
- **Hooks** : lefthook porte le niveau 1 et le niveau 2 rapides.

## Sources

- https://biomejs.dev/linter/rules/no-restricted-imports/
- https://biomejs.dev/linter/rules/no-re-export-all/
- https://biomejs.dev/linter/rules/no-barrel-file/
- https://biomejs.dev/linter/rules/no-import-cycles/
