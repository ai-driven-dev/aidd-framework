---
status: done
---

# Phase 4 — Le coût d'ajout d'un outil, mesuré pour le prochain

## Le défaut, en deux moitiés

Le test s'appelait « adding a tool costs one file ». Le coût réel est dix fichiers.

**Le matcher ne voyait qu'une forme sur quatre.**

```ts
return TOOL_IDS.some((id) => source.includes(`"${id}"`));
```

Un littéral entre guillemets doubles, et rien d'autre. Invisibles : la clé nue
(`codex: { … }`), le chemin d'import d'un profil, et le nom noyé dans une chaîne plus longue.
La troisième est décisive : `presentation/commands/translate.ts` liste les cinq outils dans
son texte d'aide, et `grep -c '"claude"'` y renvoie **0**.

Pire, sa propre sonde le validait contre `'if (id === "cursor")'` — la seule forme qu'il
attrape.

**La liste des outils était écrite à la main**, donc un outil *nouveau* n'était pas apparié du
tout. Une relecture a ajouté un vrai sixième profil, écrit son nom dans un fichier que la règle
interdit, et toute la suite d'architecture est restée verte. La règle qui borne le coût du
prochain outil ne pouvait pas voir le prochain outil.

## Ce qui change

**Les outils viennent des répertoires de profils.** Un profil est soumis à la règle dès qu'il
existe, sans que personne édite une liste.

**Quatre formes, commentaires retirés d'abord.** Littéral, clé d'objet, chemin d'import, et
chaîne qui **énumère au moins deux** outils — une ligne d'aide listant cinq cibles est une
liste qu'une sixième doit rejoindre. Une chaîne nommant un seul outil est laissée : un message
sur l'outil qui existe n'est pas une liste en attente.

La prose est de la documentation, pas du couplage. Un commentaire expliquant que la disposition
de claude diffère ne coûte rien à un sixième outil.

## Le calibrage, mesuré et non deviné

Trois règles essayées avant de choisir :

| Règle | Fichiers signalés |
| ----- | ----------------: |
| mot entier partout, commentaires inclus | 52 |
| quatre formes, toute chaîne nommant un outil | 25 |
| quatre formes, chaîne énumérant ≥ 2 outils | **10** |

Les dix recoupent l'expérience de la relecture, qui avait touché dix fichiers hors profil.

## Le socle, avec ses comptes

Trois entrées portent une raison qui n'est pas de la dette — les recommandations d'outils, le
nom d'un artefact de configuration, l'allowlist des CLI pour lesquelles un activateur existe.

Les sept autres sont la facture réelle, et elles se divisent en deux :

- **L'enregistrement**, quatre fichiers : les trois câblages répètent les mêmes imports à effet
  de bord, et le chargeur d'assets indexe un enregistrement par outil. Un profil qui
  s'enregistrerait lui-même les supprimerait tous les quatre.
- **Les mots montrés à l'utilisateur**, trois fichiers : `translate` liste ses cibles dans son
  aide, `setup` donne des exemples, le menu étiquette ses entrées. Les dériver du registre est
  possible, et c'est un changement de présentation.

## Ce que le périmètre n'inclut pas, et le chiffre pour le dire

Le périmètre est `src/`. Le coût mesuré comprend aussi trois fichiers sous `tests/` — la liste
d'enregistrement de la conformance, les identifiants codés de `tool-config`, l'aide des deps
unitaires — plus les listes de cibles de la matrice golden. Un test qui nomme l'outil qu'il
teste n'est pas du couplage, donc ils ne sont pas gardés ici ; le chiffre est écrit pour que
les dix ne passent pas pour la facture entière.

## Test

Sonde décisive : un vrai sixième profil créé, son nom écrit dans un fichier interdit. Avant,
37/37 verts. Après, la règle le nomme. Profil et sonde retirés, arbre vérifié propre.

Trois autres sondes dans le fichier : chacune des trois formes que le matcher précédent ratait,
plus un commentaire et un message à un seul outil, qui doivent rester silencieux.

Gates : tsc propre · lint 510 fichiers 0 warning · knip propre · 2071 tests / 207 fichiers ·
arch 49/49.
