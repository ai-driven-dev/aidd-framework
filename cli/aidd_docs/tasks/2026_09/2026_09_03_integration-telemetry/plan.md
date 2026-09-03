---
objective: "La télémétrie de next vit dans la nouvelle architecture, et rien de ce qui marchait des deux côtés ne s'arrête."
status: pending
---

# Plan : intégrer la télémétrie sans régression

## Ce que la mesure dit, contre ce que je disais

J'ai répété qu'« 147 des 148 fichiers atterrissent sur des chemins supprimés ». C'est exact et
c'était trompeur : ça décrit les chemins, pas le travail. Une fusion d'essai — `merge-tree`,
arbre de travail intact — donne la vraie forme.

```
232 fichiers en conflit
    129  file location    les deux côtés ont bougé : choix mécanique, notre emplacement gagne
     75  content          vrai conflit textuel
     22  modify/delete    next modifie ce qu'on a supprimé : une décision chacun
      6  rename/rename, rename/delete, directory split
```

Et par catégorie d'apport :

```
             ajoutés  reportés par git  DURS
cli/src         72          60           14
cli/tests      124          70            5
plugins         35          12            0
scripts         63           4            0
```

Git suit 60 de nos renommages tout seul. **Dix-neuf fichiers demandent un jugement**, et je
peux tous les nommer.

Fait structurel vérifié en premier, parce qu'il aurait tout changé : le commit de migration
`10bdd605` est ancêtre des deux branches. L'arbre `cli/` n'est pas ajouté deux fois ; c'est une
fusion à trois branches normale.

## La contrainte qui commande le reste

La télémétrie ne doit pas atterrir dans l'ancienne disposition puis être rangée après. Elle
doit **naître dans la nouvelle architecture**. Bonne nouvelle : elle est déjà en couches —
domaine (7 modèles, 4 ports, 1 capacité, 1 format), application (7 cas d'usage), affichage,
infrastructure (4 adaptateurs). Elle demande à être placée, pas restructurée.

Cible :

```
contexts/telemetry/domain/          modèles, ports, capacité
contexts/telemetry/application/     les sept cas d'usage
contexts/telemetry/infrastructure/  sink, evidence, lecteurs de coût
presentation/display/               les cinq afficheurs
presentation/commands/telemetry.ts  la commande
runtime/git/                        le VersionControl à six méthodes et son adaptateur
```

## Le cycle, et pourquoi il ne prend pas de socle

`diagnose-telemetry-use-case` lit `ManifestRepository`, qui vit dans `contexts/framework`. Et
`clean-use-case` + `gitignore-use-case`, côté framework, atteignent la télémétrie. Cycle, que
`context-graph` interdit.

Un socle le rendrait légal et permanent. Un `grep` tranche autrement :

```
manifestRepo.load()
manifestRepo.path            (pour un message d'erreur)
manifest.getPlugins(tool)
```

Rien sur les versions, les fichiers suivis, l'état de fusion. La télémétrie ne veut pas le
manifeste : elle veut **la liste des plugins installés par outil**. Elle déclare donc son
propre port étroit, l'adaptateur de `framework` le satisfait, et le graphe redevient acyclique :
`framework -> telemetry -> {kernel, tools}`.

## Une décision de la journée que la fusion révise, et pourquoi ce n'est pas un revirement

J'ai supprimé `VersionControl` et son adaptateur : un port à une méthode,
`installPreCommitDelegate`, sans aucun appelant.

`next` porte un `VersionControl` **différent** sous le même nom : six méthodes, toutes des
questions git posées par la télémétrie — URL du remote, pose et retrait du délégué de message
de commit, fichiers suivis, présence d'un dépôt, historique, état du trailer. Il est appelé.

La fusion prend celui de next. Ma suppression reste juste pour ce qu'elle a retiré ; les deux
ports ne partagent que leur nom.

## Les critères d'acceptation existent déjà

Je n'ai pas de liste à écrire : les 54 tests d'architecture **sont** la définition mécanique de
« conforme à la nouvelle architecture ».

| Garde | Ce qu'il imposera à la télémétrie |
| ----- | --------------------------------- |
| `context-boundary` | déclarer une surface publique, sinon elle n'est pas clôturée |
| `context-graph` | résoudre le cycle plutôt que l'admettre |
| biome `domain`/`application` | ses afficheurs sortent du contexte |
| `ports-are-called` | aucune de ses six méthodes git n'arrive sans appelant |
| `errors-that-are-thrown` | aucune de ses classes d'erreur n'arrive orpheline |
| `folder-size` | sept cas d'usage tiennent, dix ne tiendraient pas |
| `codebase-map` | la carte dessine le contexte, dans les deux sens |
| `referenced-paths` | ses documents ne citent pas les anciens chemins |
| `tool-addition-cost` | ses lecteurs de coût par outil ne nomment pas les outils hors profil |

## L'oracle qui manque, et qu'il faut capturer avant de commencer

Les 9 cellules golden et le smoke prouvent que **notre** comportement survit. Rien ne prouve
que celui de la télémétrie survit au déplacement.

À capturer sur `origin/next` avant tout : le nombre et les noms des tests qui passent sur ses
**87 fichiers de test** côté CLI, ses 12 tests de scripts, et son plugin de 35 fichiers.

Après fusion, les mêmes tests — repointés vers les nouveaux chemins, **corps inchangés** —
doivent passer. Un test de télémétrie dont il faut changer le *corps* est le signal d'arrêt :
c'est la même règle que les vérifications de déplacement pur tenues toute la journée.

## Phases

| # | Phase | Gate |
| - | ----- | ---- |
| 0 | Capturer l'oracle sur `origin/next` | le relevé existe et est commité |
| 1 | Brancher sur HEAD, fusionner, ne rien résoudre | 232 conflits, le compte est celui prévu |
| 2 | Les 163 fichiers ajoutés, non câblés | tsc, suite inchangée |
| 3 | Les 129 conflits d'emplacement | arch 54/54 |
| 4 | Les 22 modify/delete, décision écrite avant résolution | tsc, knip |
| 5 | Les 75 conflits de contenu, une aire à la fois | suite + arch après chaque aire |
| 6 | Reloger la télémétrie dans son contexte | arch 54/54, cycle résolu par un port |
| 7 | Les deux oracles | 9 cellules golden, smoke 22/22, tests télémétrie inchangés |

## Ce qui est interdit dans ce plan

**Aucune entrée de socle ajoutée pour faire passer la fusion.** Un socle est de la dette
mesurée, pas un passage en force. Si un garde refuse la télémétrie, c'est le placement qui
change, pas le garde.

**Aucun corps de test modifié pour le faire passer.** Repointer un import est un déplacement ;
changer une assertion est une régression déguisée.

**On ne commence pas sur cette branche.** Une branche depuis HEAD, pour que `git merge --abort`
reste disponible et que les 102 commits restent joignables.
