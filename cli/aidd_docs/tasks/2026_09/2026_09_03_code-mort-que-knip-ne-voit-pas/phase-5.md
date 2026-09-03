---
status: done
---

# Phase 5 — Le garde qui rend cet angle mort visible

## Ce qu'il attrape, et pourquoi rien ne l'attrapait

Un port déclare, un adaptateur implémente. Les deux fichiers nomment la méthode, donc `knip`
les compte utilisés tous les deux. Personne ne vérifie qu'un **appelant** existe.

Quatre méthodes ont vécu ainsi, retirées en phase 2, et la même cécité a gardé
`GitAdapter.installPreCommitDelegate` en vie depuis le jour de son arrivée.

Le garde compare les cinquante méthodes déclarées par les vingt fichiers de `ports/` aux
`.methode(` écrits ailleurs dans `src`. Socle vide, et il l'était déjà avant que je l'écrive :
les phases 2 et 4 ont vidé la liste, ce garde empêche qu'elle se remplisse.

## Ce qu'il ne prouve pas, écrit dans le garde

La vérification est volontairement grossière. Une méthode dont le nom est partagé par une autre
sera lue comme appelée. Le garde ne peut donc pas prouver qu'une méthode de port est atteinte
sur un chemin réel — seulement que **personne, nulle part, n'écrit son nom comme un appel**.

C'est le cas qu'il existe pour attraper, et les quatre méthodes de la phase 2 étaient
exactement celui-là. Le dire dans le fichier évite qu'on lui prête plus de portée qu'il n'en a
— la faute que cette session a passé la journée à corriger ailleurs.

## Test

Sonde : une méthode ajoutée à `FileMerger` que rien n'appelle échoue en la nommant. Une
troisième assertion refuse que le garde passe en ne sélectionnant aucun port.

Gates : tsc propre · lint 507 fichiers 0 warning · knip propre · 2054 tests / 207 fichiers ·
arch 54/54 · couverture 93,84 % · paquet 370,7 Ko · 9 cellules golden identiques ·
smoke 98/0, 22/22.
