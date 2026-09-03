---
objective: "Aucun garde ne passe au vert sur un périmètre plus étroit que son propre nom."
status: pending
---

# Plan : que chaque garde mesure ce qu'il annonce

## Le défaut, une seule forme répétée

Cinq relectures indépendantes ont attaqué le CLI. La direction des dépendances tient — sept
sondes, sept refus, zéro violation sur 252 fichiers. Ce qui ne tient pas est ailleurs, et
c'est chaque fois la même chose :

| Garde | Son nom promet | Son périmètre couvre |
| ----- | -------------- | -------------------- |
| `context-boundary` | la frontière des contextes | trois contextes sur quatre |
| `tool-addition-cost` | le coût d'ajout d'un outil | les outils déjà présents |
| `referenced-paths` | « a path named in the skills » | `.claude/skills` seulement |
| `docs-do-not-lie` | les documents ne mentent pas | deux documents, pas celui qui mentait |
| `codebase-map` | la carte correspond à l'arbre | l'arbre vers la carte, pas l'inverse |
| `no-shared-binary` | personne ne partage le binaire | les fichiers sous `tests/` |
| `errors-that-are-thrown` | chaque erreur est levée | chaque erreur a un `throw new` **textuel** |

Et la même forme dans mes propres mesures de la journée : une regex exigeant un préfixe
`src/` que les skills n'écrivent jamais, un `du` renvoyant 0 Mo sur des liens symboliques, un
grep de références périmées cantonné à `cli/` alors que le workflow cassé est au-dessus.

Le dépôt connaît déjà le remède et l'a écrit une fois : `import-rules-bite.arch.test.ts`
existe parce qu'un motif ne correspondant à rien a laissé `translate` importer `framework`
pendant six phases. Ce plan étend ce geste à tous les gardes.

## L'ordre, et pourquoi celui-là

Les gardes d'abord, avant tout autre correctif, parce qu'un garde qui ment rend inutilisable
chaque mesure qui le suit. Le code mort mesuré aujourd'hui — vingt champs de `Deps`, quatre
méthodes de port, `wireTranslate()` entier — attend la phase suivante : il se supprime mieux
avec des gardes en qui on peut avoir confiance.

## Phases

| # | Phase | Ce qu'elle ferme |
| - | ----- | ---------------- |
| 1 | Le contexte que la frontière ne regardait pas | `framework` hors clôture, 14 imports non vérifiés |
| 2 | Les gardes dont le périmètre est plus étroit que le nom | `referenced-paths`, `docs-do-not-lie`, `codebase-map`, `no-shared-binary` |
| 3 | Les socles admettent des arêtes, pas des comptes | dette admise qui grossit sans bruit |
| 4 | Le coût d'ajout d'un outil, mesuré pour le prochain | matcher aveugle à trois formes sur quatre |
| 5 | Le code mort dans les gardes eux-mêmes | entrées inertes, branches mortes, deux extracteurs qui se contredisent |
| 6 | La règle de couche que personne ne garde | `application` importe `infrastructure` sans obstacle |

## Ce qui reste hors de portée, volontairement

**Ce n'est pas une usine à gaz.** Trois règles que le gouvernail applique et que je n'importe
pas ici : les plafonds de taille et de complexité (`max-lines 220` refuserait
`wiring/framework.ts` à 519 lignes et `kernel/errors.ts` à 517 — c'est une décision de
découpage, pas un garde à poser), la vérification de duplication documentaire (le vrai défaut
est trois copies du même document d'instructions, qu'un fichier-pointeur supprime mieux qu'un
vérificateur), et l'enforcement au niveau du type par compilation de sondes (excellent, et
prématuré ici).

Un garde ne se pose que s'il attrape un défaut que ce dépôt peut vraiment avoir. Chaque phase
en fournit la preuve : la sonde qui échoue avant le correctif.

## Le socle grandit une fois, et c'est assumé

La phase 1 ajoute 14 entrées au socle de `context-boundary` — le contraire de la règle « un
socle ne fait que rétrécir ». La règle vaut pour une dette nouvelle, pas pour une dette qui
existait et n'était pas comptée. Ces 14 imports sont là depuis toujours ; les écrire est ce
qui permet de les faire décroître. Un socle qui passe de 5 à 19 en révélant 14 imports
jusqu'ici invisibles est un gain, pas une régression, et le dire ainsi est la seule façon
d'éviter que quelqu'un « corrige » le chiffre plus tard en rétrécissant le périmètre.
