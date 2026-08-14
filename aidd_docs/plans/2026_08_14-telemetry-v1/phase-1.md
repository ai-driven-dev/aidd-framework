---
status: pending
type: phase
---

# Instruction : les faits, corrigés et datés

Ferme #618 avec les corrections mesurées pendant la campagne. Première parce que tout le reste cite ce fichier : une erreur ici devient une erreur dans chaque artefact généré.

## Architecture projection

```txt
plugins/aidd-context/skills/08-hook-generate/references/
└── tool-paths.md   ✏️ marques [v]/[?], sources datées, verrous, corrections
```

## Corrections à porter

| Sujet | État du fichier | Mesuré |
| --- | --- | --- |
| Codex `SessionEnd` | absent du tableau | existe, 1 s par défaut, 3 s au maximum, ne tire pas pour les sous-agents |
| Moments Codex | huit listés | trois manquants : `PermissionRequest`, `PostCompact`, `SubagentStart` |
| Verrous de hook | rien | Codex : drapeau + confiance persistée. Copilot : confiance du dossier, contournée par le périmètre utilisateur. Cursor : `--trust`. Claude Code : aucun |
| Cursor en ligne de commande | non traité | `cursor-agent` lit `.cursor/hooks.json`, mesuré |
| Identifiants Cursor | un seul décrit | trois dans le payload : `session_id`, `conversation_id`, `generation_id`, égaux sur une session à un tour |
| OpenCode | « hooks impossibles » | exact pour les hooks ; mais il exporte en OTel derrière `experimental.openTelemetry` |

## Test

Chaque cellule factuelle porte `[v]` ou `[?]`. Une section `Sources` liste chaque page lue avec sa date. Aucune cellule `[?]` n'a été promue sans relecture. Les six corrections ci-dessus sont dans le fichier.
