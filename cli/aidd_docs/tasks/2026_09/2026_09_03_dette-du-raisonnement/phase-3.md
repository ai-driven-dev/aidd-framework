# Phase 3 — Un compteur qu'on ne peut plus écrire faux

status: done

## Le défaut

Le socle de `folder-size` portait ses comptes en commentaire :

```ts
// 14 — thirteen files, one per command … The two helpers could move and would leave twelve
"src/presentation/commands",
```

Treize plus deux ne font pas quatorze, et le vrai compte n'est ni l'un ni l'autre : onze
fichiers enregistrent une commande, `menu.ts` porte la boucle interactive, deux sont des
utilitaires. Douze plus deux.

`expectRatchet` compare des noms de dossier. Rien ne lisait ces nombres, donc rien ne pouvait
les contredire — et l'erreur a survécu dans quatre documents.

## Ce qui change

Le socle devient `{ path, count }` et un test compare le compte enregistré à celui mesuré.
Un nombre écrit sans être mesuré échoue immédiatement, et une dérive silencieuse aussi.

La sonde du dossier synthétique traverse maintenant `expectRatchet` au lieu de s'arrêter au
détecteur — le critère de la phase précédente promettait « échoue **le socle** en le
nommant », et seule la moitié était couverte.

## Test

Sonde manuelle, en mettant délibérément `count: 13` :

```
× holds each baseline entry to the count its reason was written around
  → expected [ 'src/presentation/commands: 14' ] to deeply equal [ 'src/presentation/commands: 13' ]
```

L'affirmation exacte qui a survécu quatre fois échoue maintenant à l'écriture.
