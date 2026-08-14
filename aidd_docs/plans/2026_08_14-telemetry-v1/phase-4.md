---
status: pending
type: phase
---

# Instruction : le chiffre

Joindre le journal et la télémétrie, et afficher ce qu'une tâche a coûté.

## Architecture projection

```txt
cli/src/application/commands/
└── telemetry.ts          ✏️ sous-commande report

cli/src/domain/telemetry/
└── join.ts               ✅ runs + export → agrégats
```

## Ce que la commande affiche

```txt
aidd telemetry report --task 2026_08_14_telemetry-v1

  sessions            6
  temps actif         47 min
  tokens              310 400   dont 34 % de cache
  coût                4,20 $

  par étape
    aidd-dev:02-implement    61 %   2,56 $
    aidd-dev:05-review       19 %   0,80 $
    aidd-dev:01-plan         12 %   0,50 $
    reste                     8 %   0,34 $

  par modèle
    claude-opus-5            78 % du coût pour 31 % des appels
```

## La jointure

Sur Claude Code elle est directe : la télémétrie porte déjà `skill.name` sur `claude_code.token.usage` et sur `claude_code.cost.usage`, et `session.id` sur les deux. Le journal ne sert qu'à savoir de quelle **tâche** il s'agit — la seule chose que l'outil ne peut pas savoir.

Le découpage par étape vient donc du fournisseur, pas de nous. Réserve mesurée : `skill.name` est collant, il désigne la dernière skill activée. L'attribution est juste pour des étapes qui se succèdent et fausse pour des skills entrelacées ; la commande doit le dire plutôt que de le masquer.

## Test

- Le total par étape égale le total de la tâche, sans écart silencieux.
- Une tâche sans session affiche zéro, pas une erreur.
- Une session dont l'identifiant ne joint rien est comptée comme non attribuée et signalée, jamais ignorée.
- La part non rattachée à une tâche est affichée : annoncer une mesure complète en mesurant deux tiers est le mode d'échec à éviter.
