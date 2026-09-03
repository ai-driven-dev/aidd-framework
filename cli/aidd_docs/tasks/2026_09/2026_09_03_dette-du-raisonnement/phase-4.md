# Phase 4 — Les chiffres faux, là où ils sont écrits

status: done

## Ce qui était faux

| Écrit | Mesuré |
| ----- | ------ |
| « biome 485 files » | `pnpm lint` dit `Checked 511 files`. 485 est le compte de `biome check src tests` : un chiffre réel, pris d'une commande plus étroite que la gate qu'il nommait |
| « 2 032 tests over 1 001 suites » | `Test Files 205 passed`, `Tests 2032 passed` |
| « dix-neuf chemins d'import périmés dans la liste des modules publics » | neuf entrées sur dix-huit lignes, dont quatre dans cette liste |
| « 36 files of 62 » touchent le manifeste | 41 sur 62, prédicat énoncé ci-dessous |
| tableau des sous-dossiers de `framework` | huit lignes sur dix ; `framework/` et `shared/` manquaient |
| `install 6/12`, `uninstall 3/4` | comptes d'avant déplacement présentés comme le relevé |
| « ses seuls importateurs » (phase-2) puis « ses quatre importateurs » | quatre, dont le câblage et le test |

## Le prédicat, qui manquait

Un chiffre sans son prédicat n'est pas une mesure, c'est une assertion. Celui-ci :

```sh
grep -rlE 'from "[^"]*[Mm]anifest' src/contexts/framework/application/<sous-dossier> --include='*.ts'
```

41/62. Reproduit indépendamment par une relecture qui n'avait pas vu le mien.

## Ce que le chiffre ne prouvait pas

Le non-découpage de `contexts/framework` tient — deux relectures indépendantes y arrivent —
mais pas par ce chiffre. Un couplage dense au manifeste plaide pour un manifeste *partagé*,
pas contre un découpage : ce dépôt porte déjà une quatrième chose dont les contextes
dépendent, elle s'appelle `src/kernel`. Ce qui tranche est qualitatif et vérifiable en lisant
le dossier : un contexte possède un concept, celui-ci possède le relevé d'installation, et le
manifeste est le cycle de vie de ce relevé — créé par install, lu par doctor, réécrit par sync,
rejoué par restore. Découpé en trois, personne ne le possède.

Le chiffre reste, avec son prédicat. Il n'est plus l'argument.

## Ce qui reste hors de portée

`224deafa` et `884501da` portent les chiffres faux dans leur message. Rien n'est poussé, la
réécriture reste possible ; elle n'est pas prise ici parce que réécrire l'historique n'est pas
une décision d'agent. Le message de clôture les nomme.

## Test

```sh
grep -rnE '\b485\b|\b1001\b|dix-neuf' cli/aidd_docs/tasks/2026_09/
```

Une seule occurrence subsiste : la ligne qui enregistre la correction.
