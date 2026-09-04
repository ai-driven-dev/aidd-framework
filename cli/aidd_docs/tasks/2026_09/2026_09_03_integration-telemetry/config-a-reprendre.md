---
status: pending
---

# La configuration de `next` mise de côté pendant la fusion, et qu'il faut reprendre

## Ce que c'est

`next` porte dans son `biome.json` une règle que nous n'avons pas :

```json
"complexity": {
  "noExcessiveLinesPerFunction": {
    "level": "error",
    "options": { "maxLines": 20, "skipBlankLines": true, "skipIifes": true }
  }
}
```

C'est **exactement** un des trois manques que la comparaison au harnais du gouvernail avait
nommés : le CLI n'a aucun plafond de taille, là où `wiring/framework.ts` fait 519 lignes et
`kernel/errors.ts` 517.

## Pourquoi elle n'est pas prise dans la fusion

Elle arrive avec dix-sept exemptions, toutes vers des chemins que la refacto a supprimés :

```
src/application/use-cases/framework/strategies/tool-contracts.ts
src/application/use-cases/install/install-content-section-use-case.ts
src/application/use-cases/plugin/plugin-add-use-case.ts
src/domain/capabilities/plugins-capability.ts
src/domain/formats/jsonc.ts
src/domain/models/plugin-source.ts
src/domain/tools/ai/copilot.ts
src/infrastructure/deps.ts
… et neuf autres
```

Les importer telles quelles ne protégerait rien — `import-rules-bite` refuserait d'ailleurs
des globs nommant des chemins morts. Les re-dériver contre notre arbre demande de mesurer
quelles fonctions dépassent vingt lignes chez nous, ce qui est une **gate neuve**, pas une
nécessité de fusion. L'ajouter pendant qu'on résout 232 conflits met les deux en danger.

## Ce qu'il faudra faire, après la fusion

1. Mesurer : combien de fonctions dépassent 20 lignes dans `src/`, et où.
2. Décider du seuil sur cette mesure plutôt que sur celui de `next` — 20 est leur chiffre,
   pas forcément le nôtre, et un seuil qui exempte cinquante fichiers ne gate rien.
3. Écrire les exemptions avec une raison chacune, comme les socles des tests d'architecture :
   une exemption sans raison est une dette qu'on ne saura plus lire.
4. Vérifier que la règle mord, en allongeant une fonction volontairement.

## Ce qui la garde en vie

Ce document. La règle a été écartée par un choix de séquencement, pas rejetée — et un choix
de séquencement qui n'est écrit nulle part est un oubli avec un délai.

---

# Deuxième : le contrôle de couches de `next`, `scripts/check-cli-layering.mjs`

## Ce que c'est

Un hook `cli-layering` dans `lefthook.yml`, adossé à un script qui vérifie deux invariants
que biome ne sait pas exprimer : les dépendances pointent vers l'intérieur, et aucun type
n'est élargi par `as unknown as` ni `as never`.

Sa raison d'exister est **exactement** notre trouvaille sur `import-rules-bite`, arrivée
indépendamment :

> Measured, not assumed — a `noRestrictedImports` rule written against
> `"../../infrastructure"` never fired on a violation planted in `src/domain`.

## Ce qu'il trouve chez nous, aujourd'hui

Lancé tel quel contre notre arborescence, il fonctionne et signale six élargissements de type
réels :

```
src/contexts/translate/application/translate-source.ts
tests/contexts/framework/application/flows/marketplace-sync-settings.unit.test.ts
tests/contexts/framework/application/shared/ensure-built-marketplace-use-case.integration.test.ts
tests/contexts/tools/domain/mcp-exclusion.unit.test.ts
tests/contexts/tools/domain/registry-conformance.unit.test.ts
tests/runtime/auth/auth-provider-adapter.unit.test.ts
```

Le dernier est un test écrit aujourd'hui même. Le contrôle attrape donc du code neuf, pas
seulement de l'ancien — c'est un argument pour l'adopter, pas contre.

## Pourquoi il n'est pas pris dans la fusion

Sa liste `CASTS_ALLOWED` nomme des chemins d'avant la refacto, et il le signale lui-même :
`framework-build-use-case.ts no longer casts - drop its CASTS_ALLOWED entry`. L'adopter
demande de trancher six casts ou de re-baser la liste — une gate neuve, la même décision que
pour la règle de taille, et le même risque à la prendre au milieu de 232 conflits.

## Ce qu'il faudra faire

1. Trancher les six : chacun est soit un vrai défaut de typage, soit une exemption qui mérite
   sa raison écrite.
2. Vider `CASTS_ALLOWED` de ses entrées mortes.
3. Rebrancher le hook `cli-layering` dans `lefthook.yml`.
4. Vérifier qu'il mord, en plantant un `as unknown as` volontaire.
