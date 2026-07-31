# Simplifier la contribution — un seul chemin, issue-first

Aujourd'hui le guide de contribution différencie l'entrée par rôle (Public/Core Team/Certifié/Habilité) et réserve l'ouverture de PR au Certifié. Objectif : un seul chemin pour tout le monde, sans distinction de rôle. Seule règle dure : une issue avant toute PR, pour cadrer le sujet en amont et éviter du dev hors-sujet ou contraire aux principes.

## Ce qui est clair

- Un seul flux, ouvert à tous, plus de tableau d'entrée par rôle.
- Issue obligatoire avant PR — deux templates au choix du contributeur : minimal, full. Formulaires structurés GitHub (comme `bug_report.yml`/`feature_request.yml`), pas de texte libre.
- Feu vert = un mainteneur bascule le Status de l'issue `Ideation → Todo` sur le Roadmap board existant (`ai-driven-dev` project #8). Pas de nouveau label, pas de nouveau mécanisme.
- Pas de vote roadmap (≥7 jours) pour ces issues — supprimé.
- N'importe qui peut ensuite ouvrir la PR — le gate "Certifié requis" (`GOVERNANCE.md`) est supprimé. Vérifié : ça ne touche que ce droit-là (Certifié garde son vote roadmap et son chemin de promotion vers Habilité, intacts).
- Nouvelle section **Principes** dans `CONTRIBUTING.md` (pas un fichier à part, pas dans `CLAUDE.md` qui est IA-facing) : anti AI-slop, éviter le gaspillage de token, suivre la structure des skills, faire évoluer la memory. La relecture ligne-à-ligne existe déjà (case à cocher PR template) — pas à réécrire.
- Format final attendu : ultra concis, bullet points, un flow mermaid si ça aide à visualiser le chemin (issue → validation → PR). Le contributeur doit pouvoir suivre en cliquant, ou coller la section telle quelle à une IA qui exécute pour lui.

## Encore ouvert

- Champs exacts des deux templates (minimal vs full) — détail d'implémentation, tranché à l'écriture.
- Formulation exacte de la section Principes — les exemples sont posés, la prose reste à écrire.

## Suivi séparé (pas dans ce brief)

- Challenger l'ensemble des docs root + `docs/` (12 + 7 fichiers à la main) — sujet distinct, à ouvrir comme sa propre idée si besoin.

## Next move

Écrire les changements : `CONTRIBUTING.md` (flux + section Principes), `GOVERNANCE.md` (retrait du gate Certifié sur l'ouverture de PR), les 2 templates d'issue.
