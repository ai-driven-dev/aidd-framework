# Phase 1 — La paire que la raison du noyau omettait

status: done

## Le défaut

`src/kernel` restait au socle avec cette raison : « le vocabulaire que parlent les quatre
contextes : errors, file, paths, markdown, jsonc, merge, scope, source, tool. Un dossier ici
serait une catégorie inventée pour le compte. »

Neuf noms pour onze fichiers. Les deux absents sont exactement ceux qui réfutent la phrase :
`flat-paths.ts` et `relative-link-rewrite.ts`.

## La mesure

```sh
grep -rln "kernel/flat-paths.js" src --include='*.ts' | grep -v '^src/kernel/'
grep -rln "kernel/relative-link-rewrite.js" src --include='*.ts' | grep -v '^src/kernel/'
```

| Fichier | Appelants |
| ------- | --------- |
| `flat-paths.ts` | 5 `profiles/*/build.ts` + `translate/…/flat-build-strategy.ts` |
| `relative-link-rewrite.ts` | les mêmes, plus `tools/domain/marketplace-catalog.ts` et `translate/…/marketplace-strategy-helpers.ts` |

Huit fichiers distincts, deux contextes, cinq d'entre eux lisant les deux modules. C'est le
recouvrement qui compte, pas un total : « lus par les mêmes huit fichiers » serait faux, et
cette formulation fausse est passée d'ici dans le commentaire du test et dans le plan.

## Le nom, qui était le vrai arbitre

`flat/` aurait menti : `relative-link-rewrite` sert aussi le chemin marketplace. Le critère
n'était pas « ces deux fichiers vont-ils ensemble » mais « existe-t-il un nom honnête qui
couvre les appelants des deux ». `materialization/` le fait : les deux sont des primitives de
matérialisation de contenu — où le fichier atterrit, comment ses liens suivent — et les deux
formes de matérialisation, flat et marketplace, les appellent.

Sans ce nom, le bon geste aurait été de corriger la raison, pas de déplacer.

## Résultat

`src/kernel` passe de 11 à 9 et quitte le socle. Il ne reste qu'une entrée.

## Test

`pnpm test:arch` — le socle de taille signale `src/kernel` comme « fixed », la carte du code
réclame `materialization/`. Les deux sont les gardes qui font leur travail, pas des
régressions.
