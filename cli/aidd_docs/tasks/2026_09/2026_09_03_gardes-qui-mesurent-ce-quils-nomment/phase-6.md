---
status: done
---

# Phase 6 — La règle de couche que personne ne gardait

## Ce qui était gardé, ce qui ne l'était pas

`domain` ne peut pas importer `application`, `infrastructure`, `presentation` ni `runtime` :
enforcé par `biome.json`, en CI, et attaqué sept fois par une relecture — import relatif,
`import type`, import dynamique, profondeur arbitraire de `../`. Refusé à chaque fois.

`application` ne peut pas importer `infrastructure` : **rien ne l'interdisait**. Zéro violation
aujourd'hui, mesuré des deux côtés indépendamment. Une règle gratuite à poser tant qu'elle est
vide, coûteuse le jour où elle ne l'est plus.

## Une moitié posée, une moitié refusée

La première version interdisait aussi `presentation`. Elle a trouvé des violations — et ce sont
exactement les quatre imports de l'arête `framework->presentation` que `context-graph` admet
déjà nommément, avec sa raison : trois orchestrateurs nomment les classes d'invite qu'on leur
passe, en `import type`, et les inverser en port est un changement de conception.

La doubler en erreur biome aurait cassé la construction pour une dette délibérément consignée.
Réduite à `infrastructure`, la moitié qui est propre.

## Ce que je refuse, avec la mesure

Le gouvernail interdit au domaine d'importer un paquet tiers — `react`, `@tanstack/*`,
`@prisma/client`. Mesuré ici, le domaine importe deux choses :

```
node:path    6 fichiers   isAbsolute, relative, join
smol-toml    2 fichiers   parse, stringify
```

Les deux sont purs : manipulation de chaînes et sérialisation, sans I/O ni cycle de vie. Ce
n'est pas la classe que le gouvernail vise. Interdire reviendrait à injecter un sérialiseur
TOML par un port pour ne rien gagner. La règle existe pour tenir l'I/O et l'interaction humaine
hors du domaine, pas les imports.

## Le document qui se contredisait

`ARCHITECTURE.md` disait « Three invariants hold this together, and each is enforced by a test
rather than by this document » puis, quatre lignes plus bas, « A biome override refuses… ». Le
paragraphe se contredisait lui-même, et **il ne mentionnait pas du tout la règle de couche** —
sa section s'intitule « Contexts, not layers », et la règle n'existait que comme une chaîne
dans `biome.json`.

Quatre invariants sont maintenant écrits, chacun avec ce qui l'enforce, et le refus
ci-dessus avec lui pour qu'il ne soit pas rouvert.

## Test

Sonde : un `import type` d'un adaptateur d'infrastructure depuis un fichier `application/`
refusé par biome avec le message de la règle. `import-rules-bite` voit la nouvelle règle et
confirme que son glob nomme un chemin qui existe.

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2072 tests / 207 fichiers ·
arch 50/50 · couverture 93,76 % · 9 cellules golden identiques · smoke 98/0, 22/22.
