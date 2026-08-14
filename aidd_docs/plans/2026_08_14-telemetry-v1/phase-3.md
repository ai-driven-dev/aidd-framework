---
status: pending
type: phase
---

# Instruction : la preuve que le tuyau coule

La leçon de la campagne : aucune sonde n'a marché du premier coup, et un hook installé peut rester muet sans lever d'erreur. Cette phase transforme ce constat en commande.

## Architecture projection

```txt
cli/src/application/commands/
└── telemetry.ts     ✅ sous-commande status

cli/src/domain/telemetry/
├── hook-liveness.ts ✅ un hook a-t-il tiré récemment
└── export-check.ts  ✅ l'export porte-t-il l'identifiant
```

## Ce que la commande affiche

```txt
aidd telemetry status
  ok    activé pour ce dépôt
  ok    hook posé              claude-code
  ok    hook observé           dernière écriture il y a 4 min
  ok    export configuré       OTLP vers http://127.0.0.1:4318
  ok    identifiant joignable  session.id présent dans l'export
  ok    sessions journalisées  12 sur 7 jours
  --    non couvert            codex, copilot, cursor, opencode
```

Une ligne par affirmation vérifiable indépendamment, jamais un verdict agrégé.

## Les états inertes à détecter

| Outil | Symptôme d'une installation muette |
| --- | --- |
| Claude Code | `OTEL_METRICS_INCLUDE_SESSION_ID=false` : tout est posé, rien ne joint |
| Codex | `features.hooks` désactivé, ou confiance de hook non accordée |
| Copilot | `disableAllHooks`, ou hooks de dépôt dans un dossier non approuvé |
| Cursor | confiance de l'espace de travail non accordée |

## Test

- Une installation complète mais dont l'identifiant est coupé se lit **FAIL**, pas **ok**.
- Un hook dont le fichier existe mais qui n'a jamais tiré se lit **FAIL**.
- La part de sessions journalisées sur sept jours est une ligne : c'est le seul contrôle qui prouve que le tuyau produit, plutôt qu'il existe.
- Les outils non couverts sont nommés, pas passés sous silence.
