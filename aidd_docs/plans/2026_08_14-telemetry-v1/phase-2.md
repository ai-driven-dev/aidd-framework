---
status: pending
type: phase
---

# Instruction : le journal des exécutions

Un fichier par session, écrit par un hook, jamais par le modèle. Rien d'autre.

## Architecture projection

```txt
plugins/aidd-vcs/hooks/
├── hooks.json           ✅ SessionStart + Stop
└── run-journal.js       ✅ écrit et rafraîchit le fichier de session

aidd_docs/runs/2026_08/
└── 01J9X4M2K7QRVB.json  ✅ produit à l'exécution

.aidd/telemetry.json     ✅ activation par dépôt
```

## Contenu du fichier

```json
{
  "schema_version": 1,
  "run_id": "01J9X4M2K7QRVB",
  "task_id": "2026_08_14_telemetry-v1",
  "tool": "claude-code",
  "vendor_id": "79041f53-35b0-4924-8855-e43e9de72431",
  "vendor_field": "session.id",
  "parent_run_id": null,
  "started_at": "2026-08-14T10:08:44Z",
  "ended_at": "2026-08-14T11:05:20Z"
}
```

`task_id` nul est un état normal : c'est le travail hors flux. Il se résout depuis le dossier de tâche le plus récemment touché sur la branche courante, et se corrige après coup s'il faut — le fichier est à nous.

`ended_at` se rafraîchit au dernier tour observé, pas à un événement de fin de session : Codex n'accorde à celui-ci qu'une seconde et ne le déclenche pas pour les sous-agents.

## Test

- Deux agents sur la même tâche dans deux worktrees produisent deux fichiers et zéro conflit.
- Une session qui ne produit aucun commit apparaît quand même.
- Aucun token, aucun coût, aucun modèle, aucun contenu de prompt dans le fichier.
- Un hook qui plante, expire ou ne trouve rien sort en `0` et ne bloque jamais la session.
- Sur un dépôt public, rien n'est écrit sans opt-in explicite.
