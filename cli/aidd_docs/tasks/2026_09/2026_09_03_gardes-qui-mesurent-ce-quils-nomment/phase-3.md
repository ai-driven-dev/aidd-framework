---
status: done
---

# Phase 3 — Les socles admettent des arêtes, pas des comptes

## Le défaut

Un socle qui enregistre `"framework->runtime"` dit qu'une arête existe. Il ne dit rien de son
poids. Un import de plus sur une arête déjà admise passe donc au vert, indéfiniment. Sonde de
la relecture : un tout nouvel import `framework → runtime/platform` dans un fichier qui n'en
avait aucun — test vert.

Le dépôt connaissait déjà le remède et l'avait appliqué une fois : `folder-size` porte
`{ path, count }` et vérifie le compte. Il n'avait pas été porté ailleurs.

## Une exception, mesurée avant d'agir

`context-boundary` n'en a pas besoin. Ses entrées sont des paires `importateur -> fichier`,
soit la granularité la plus fine possible : un import de plus **est** une entrée de plus. Y
ajouter un compte serait du bruit. Le dire évite qu'on l'ajoute par symétrie.

## `context-graph`

Chaque arête admise porte désormais son poids, en imports et en fichiers.

| Arête | Imports | Fichiers |
| ----- | ------: | -------: |
| `distribution->framework` | 1 | 1 |
| `distribution->runtime` | 5 | 3 |
| `framework->presentation` | 4 | 3 |
| `framework->runtime` | 13 | 11 |

**Et la mesure a corrigé le commentaire.** Un seul commentaire couvrait deux arêtes et se
trompait sur les deux : il disait « quatorze fichiers de contexte importent runtime » là où
`framework` en a onze, et attribuait à `framework` deux implémentations — le client HTTP et
l'injection de jeton git — qui appartiennent à `distribution`, laquelle en a trois.
`distribution->runtime` vivait sous ce commentaire sans raison propre.

Mesuré par cible : `framework->runtime` importe quatre choses, **toutes des interfaces**, zéro
implémentation. `distribution->runtime` importe trois implémentations et un port. Les deux
arêtes ont maintenant chacune la sienne, et elle est vraie.

## `orchestrator-deps`

Deux entrées, **aucune raison écrite** — juste « exceed the limit today », dans un fichier dont
les voisins portent des paragraphes. Mesuré : six cas d'usage injectés chacun.

`doctor` : six vérifications, une par chose qui peut dériver. Le fan-out est la fonctionnalité ;
il se résout en donnant un type de résultat à chaque vérification, pas en en retirant une.

`setup` : six étapes d'un seul flux, de rien à un projet correct. Il se résout en scindant le
flux en deux — le socle marketplace, puis les outils et les plugins.

Au passage, `isUseCase` nommait encore `src/application/use-cases/`, répertoire disparu.
Branche morte retirée ; le garde anti-périmètre-vide du fichier couvrait déjà le risque.

## Test

Deux sondes, chacune remise puis retirée, fichiers vérifiés identiques à l'octet :

- un import supplémentaire sur `framework->runtime` fait échouer le poids
- un septième collaborateur sur `doctor-use-case` fait échouer le compte

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2069 tests / 207 fichiers ·
arch 47/47.
