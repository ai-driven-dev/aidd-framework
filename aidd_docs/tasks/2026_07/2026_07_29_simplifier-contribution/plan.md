---
objective: "Tout contributeur suit un seul chemin issue-first, validé par un Certifié ou un Habilité, avant d'ouvrir sa PR."
status: in-progress
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Plan: Simplifier la contribution — un seul chemin, issue-first

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Remplacer le flux de contribution par rôle par un flux unique, ouvert à tous, gardé par une issue validée avant PR |
| **Source** | [`aidd_docs/tasks/2026_07/2026_07_29_simplifier-contribution/brainstorm.md`](./brainstorm.md) |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Flux, gouvernance et templates | [`phase-1.md`](./phase-1.md) |

## Resources

| Source | Verified          |
| ------ | ----------------- |
| GitHub GraphQL API — `ai-driven-dev` `projectV2(number: 8)` | Le champ Status existe déjà : `Ideation → Todo → In Progress → In review → Done` |
| GitHub REST API — `repos/ai-driven-dev/framework/teams` | `certified-members` a déjà `triage: true` sur le repo (push+triage+pull), hérité par `trusted-partners` (Habilité) |
| `.github/rulesets/next.json` (in-repo) | L'ouverture de PR n'est jamais techniquement gatée par équipe — seule la review/merge l'est |

## Decisions

<!-- Architecture-magnitude only, one you'd regret reversing. Omit if none qualify. -->

| Decision   | Why   |
| ---------- | ----- |
| Supprimer le gate "Certifié requis" pour ouvrir une PR (`GOVERNANCE.md`) | Décision produit confirmée par l'utilisateur, malgré l'impact sur le programme de certification payant |
| Réutiliser le champ Status existant du Roadmap board (`Ideation → Todo`) comme signal de validation | Évite d'inventer un nouveau label/mécanisme parallèle |
| Repurposer `feature_request.yml` et `roadmap.yml` en templates minimal/full plutôt que créer 2 nouveaux fichiers | Les champs existants couvrent déjà le besoin — pas de doublon |
| Le droit Certifié devient "valider les issues de contribution (triage)" à la place de "ouvrir une PR" | Permission déjà réelle (`triage: true` sur l'équipe), garde la ligne Certifié distincte de Core Team sans toucher la pipeline de nomination Habilité |
