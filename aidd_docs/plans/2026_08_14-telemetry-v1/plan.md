---
objective: "Une session AIDD sur Claude Code produit un chiffre vérifiable : ce qu'a coûté une tâche, par étape, sans qu'aucune installation muette ne passe pour saine."
status: pending
type: plan
---

# Plan : télémétrie v1 testable

## Overview

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| **Goal**   | Prouver la chaîne de bout en bout sur un outil, en une semaine |
| **Source** | Jalon 14 « Prove what an AI session costs », échéance 2026-08-21 |
| **Issues** | #617, #618, #620, bloquées par #585                        |
| **Socle**  | `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` |

## Ce que la campagne de mesure change au jalon

Le jalon a été écrit en supposant que la jointure d'identifiant était l'inconnue et le risque principal. **Elle est maintenant prouvée sur quatre outils** — Claude Code, Codex, Copilot, et par l'export sur OpenCode. Le risque a donc changé de place, et le plan doit suivre.

| Avant la campagne | Après |
| --- | --- |
| « L'identifiant du hook est-il celui de l'export ? » — inconnu, porte tout | prouvé, quatre outils, dont deux sans consommer de quota |
| « OpenCode n'a rien » | OpenCode exporte, avec tokens et `session.id` sur le même span |
| « Cursor est peut-être hors de portée en ligne de commande » | `cursor-agent` lit bien `.cursor/hooks.json` |
| Le risque est la jointure | **Le risque est qu'un hook installé ne tire jamais** |

Ce dernier point est le vrai résultat. Aucune sonde n'a fonctionné du premier coup, et jamais pour une raison différente : Codex exige un drapeau de fonctionnalité et une confiance persistée, Copilot ignore les hooks de dépôt dans un dossier non approuvé, Cursor réclame `--trust`. Un hook posé sans lever le verrou est **installé, silencieux, et ne lève aucune erreur**.

Une couche de mesure qui échoue en silence est pire qu'absente : elle produit des chiffres faux qu'on croit justes. La v1 doit donc prouver que le tuyau coule, avant de prouver ce qu'il transporte.

## Le découpage retenu

**Un outil, une tâche, un chiffre, et rien de muet.** Claude Code seul, parce que c'est le seul où la jointure tient au grain métrique et où le coût est en dollars. Les quatre autres sont déclarés non couverts par la commande d'état, ce qui est honnête et vérifiable.

| Phase | Contenu | Issue |
| --- | --- | --- |
| 1 | Corriger les références par outil avec les faits mesurés | #618 |
| 2 | Écrire le journal des exécutions | #620, resserrée |
| 3 | Prouver que le tuyau coule | moitié de #617 |
| 4 | Lire un chiffre par tâche et par étape | nouvelle |

## Ce qui sort de la v1, et pourquoi

- **Le trailer de commit** (première moitié de #617). Le journal des exécutions couvre déjà les sessions sans commit, qui sont les plus chères. Le trailer ajoute la précision par commit, pas la capacité à mesurer. Il revient au jalon suivant.
- **Les quatre autres outils.** La mécanique est identique, seule la configuration d'export change. Élargir avant d'avoir prouvé sur un seul multiplie les causes de panne.
- **`.aidd/config.yml`** (#585). Il bloque #617 et #620 sur le papier, n'existe dans aucun code, et la CLI n'a aucun analyseur YAML. Voir la décision ci-dessous.
- **Le fichier `metadata.json` et les liens vers le backlog.** Utile, conçu, mais il ne conditionne pas la mesure : un `task_id` dans le journal suffit pour un premier chiffre.
- **Le kanban et le gouvernail.** Consommateurs, pas producteurs.

## Decisions

- **Ne pas attendre #585.** La v1 lit `.aidd/telemetry.json`, en JSON, format que la CLI manipule déjà — `.aidd/manifest.json` et `.aidd/marketplaces.json` existent. Introduire un analyseur YAML dans la semaine pour une seule clé est un détour. Quand #585 arrivera, la clé migre ; c'est une ligne de lecture à déplacer, pas une conception à refaire.
- **`runs/` est global, pas dans le dossier de tâche.** Écart assumé avec #620. Un journal par tâche ne sait pas où ranger le travail hors flux — le debug de dix minutes, l'exploration. Un emplacement unique traite les deux cas à l'identique, et permet de dire « 61 % rattaché, 39 % hors tâche » au lieu d'ignorer la seconde moitié.
- **Un fichier par session.** Un seul écrivain par fichier, donc conflit de fusion structurellement impossible, quels que soient les worktrees parallèles.
- **La commande d'état ne vérifie pas l'existence d'un fichier, elle vérifie qu'un hook a tiré.** C'est la leçon de la campagne, et c'est ce qui distingue cette v1 d'une installation qui a l'air complète.
- **Aucun token, aucun coût, aucun modèle dans un fichier commité.** Ces valeurs changent en cours de session ; elles viennent de la télémétrie et se recollent à la lecture.

## Ce que la v1 permet de dire, et ce qu'elle ne permet pas

Permet : « la tâche `2026_08_14_telemetry-v1` a coûté 4,20 $, 310 000 tokens, 47 minutes actives, dont 61 % en implémentation », sur Claude Code, avec la preuve que rien n'a été perdu en route.

Ne permet pas : le même chiffre sur un autre outil, le rattachement à une story ou à un epic, la vue kanban, l'agrégation par personne ou par équipe. Ce sont les jalons suivants, et ils reposent tous sur ce que la v1 pose.

## Resources

- `aidd_docs/specs/2026_08/2026_08_13-work-tracking-linkage.md` — la conception, avec les mesures
- `aidd_docs/brainstorm/2026_08_13-telemetry-layer.md` — la cohérence d'ensemble et les cinq outils
- `plugins/aidd-context/hooks/hooks.json` — le patron de hook de plugin déjà éprouvé
- `plugins/aidd-context/skills/08-hook-generate/references/tool-paths.md` — le fichier que la phase 1 corrige
- `cli/src/application/commands/status.ts`, `doctor.ts` — les surfaces à étendre
- Les sondes de la campagne, réutilisables telles quelles pour les tests d'acceptation

## Phases

| Phase | Fichier | Objet |
| --- | --- | --- |
| 1 | `phase-1.md` | Les faits, corrigés et datés |
| 2 | `phase-2.md` | Le journal des exécutions |
| 3 | `phase-3.md` | La preuve que le tuyau coule |
| 4 | `phase-4.md` | Le chiffre |
