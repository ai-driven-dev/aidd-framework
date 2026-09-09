# Héberger les marketplaces générées par outil

Note de conception, pas une phase du refactor. Elle débloque la décision ouverte de la phase 5 et
donne sa forme au test d'acceptation de la phase 10.

## Ce qui existe déjà

**La CI publie les neuf distributions à chaque release.** `ci.yml` construit la matrice
outil × mode et attache `aidd-framework-<outil>-<mode>-<version>.zip` à la release GitHub via
`gh release upload`. Les artefacts existent, sont versionnés, et sont accessibles publiquement.

**Le CLI ne les consomme pas.** `setup --release <tag>` choisit une release du *framework source*,
puis reconstruit localement dans `.aidd/cache/built/<nom>/<cible>`. Le même build est donc fait deux
fois : une fois en CI pour publier, une fois chez chaque utilisateur pour installer.

**Et l'intention est déjà écrite.** `docs/FAQ.md:42` : « Other tools install via their native
mechanism from the release archives; public-marketplace publishing is on the way, native parity is a
roadmap item. »

## Pourquoi ça compte maintenant

Les marketplaces construites sont des **chemins locaux**. C'est la seule raison pour laquelle les
outils ne peuvent pas être pilotés uniformément.

| outil | ce que sa commande accepte | utilisable avec un chemin local |
|---|---|---|
| claude | URL, chemin, ou dépôt GitHub | oui |
| codex | snapshot de marketplace | oui (déjà piloté) |
| copilot | snapshot de marketplace | oui (déjà piloté) |
| cursor | **URL de dépôt git**, indexée par compte | **non** |

Vérifié contre les CLI installées. Héberger les marketplaces sous une forme que les quatre commandes
acceptent rend l'enregistrement uniforme — et les quatre profils d'outil ne diffèrent plus que par
leurs chemins et leurs formats, ce que vise le test d'acceptation de la phase 10.

## La question de forme

Ce qui est publié aujourd'hui, ce sont des **zips**. Ce que les commandes veulent, c'est une **URL de
dépôt git** — Cursor l'exige, et c'est ce que Superpowers fait : `sync-to-codex-plugin.sh` pousse par
rsync dans `prime-radiant-inc/openai-codex-plugins` et ouvre une PR.

Trois formes possibles, à trancher :

1. **Un dépôt git par outil**, poussé à chaque release. Ce que les commandes attendent, ce que fait
   Superpowers. Coût : quatre à neuf dépôts à créer, alimenter et versionner.
2. **Des branches d'un seul dépôt**, une par couple outil/mode. Un seul dépôt à gérer, mais toutes
   les commandes n'acceptent pas une branche arbitraire — à vérifier outil par outil.
3. **Garder les zips et ne pas piloter les commandes.** Le CLI télécharge l'archive et enregistre
   localement, comme aujourd'hui mais sans rebuild. Ne débloque pas Cursor, ne débloque pas la
   phase 5.

## Ce que ça débloquerait

- **La décision ouverte de la phase 5.** Avec une URL, il n'y a plus de chemin local à pointer, donc
  plus de dilemme entre « exiger le binaire » et « écrire le fichier en repli ».
- **Cursor piloté**, pour la première fois.
- **Un build au lieu de deux.** Le CLI cesse de reconstruire ce que la CI a déjà publié, ce qui
  supprime `.aidd/cache/built/` du chemin d'installation courant.
- **La preuve du coût d'ajout d'un outil** (phase 10) devient réelle : un profil, une entrée de
  publication, rien d'autre.

## Ce que ça coûte, et ce qui reste ouvert

- **Un projet hors ligne ne peut plus s'installer** sans réseau, là où un chemin local le permettait.
  C'est la même question que la phase 5 pose, déplacée : garder un chemin local en repli, ou pas.
- **Le contenu devient public** par construction. Un framework privé ou d'entreprise ne peut pas
  passer par un dépôt public — il faudrait alors les deux voies, pas une.
- **La révocation** : un marketplace enregistré par URL vit dans la config de l'outil, pas dans le
  projet. Le retirer demande la commande de l'outil, pas un `rm`.
- **Qui publie, et quand** : à chaque release, ou seulement sur les versions stables ? Les neuf
  cellules, ou seulement celles qu'un outil sait consommer ?

## Prochain pas

Trancher la forme (dépôt par outil, branches, ou zips), puis dimensionner. La phase 5 attend cette
réponse ; le reste du refactor n'en dépend pas.
