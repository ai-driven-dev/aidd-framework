# Contributing to the AIDD Framework

Source of truth for AIDD skills, agents, rules, and templates — authored in Claude Code syntax; the CLI adapts an archive per tool at release. This file covers contributing to **this repository**; the wider community, roles, and training programme live at [ai-driven-dev.fr](https://www.ai-driven-dev.fr/).

```mermaid
flowchart LR
    Issue["💡 Issue: Rapide ou Détaillée"] --> Validate["✅ Certifié/Habilité valide"] --> Branch["🌿 Branch off next"] --> PR["🔀 Open PR"] --> Review["🛡️ Habilité review"] --> Merge["✅ Squash-merge → next"] --> Release["🚀 Weekly promote → release-please ships"]
```

## 👥 Comment contribuer

Un seul chemin, ouvert à tous, quel que soit ton rôle ([`GOVERNANCE.md`](./GOVERNANCE.md#-roles)) :

1. **Ouvre une issue** — [🌱 Contribution Rapide](https://github.com/ai-driven-dev/framework/issues/new?template=feature_request.yml) (rapide) ou [📋 Contribution Détaillée](https://github.com/ai-driven-dev/framework/issues/new?template=roadmap.yml) (cadrée), selon ce que tu veux poser sur la table. Ça cadre le sujet en amont — pas de code écrit pour rien, pas de mauvaise direction sur nos principes.
2. **Attends la validation** — un Certifié ou un Habilité bascule l'issue de `Ideation` à `Todo` sur le [Roadmap board](https://github.com/orgs/ai-driven-dev/projects/8). C'est le feu vert.
3. **Ouvre ta PR** — n'importe qui peut, une fois l'issue validée → [Set up](#-1-set-up).

Pas de vote, pas de délai d'attente formel pour ce feu vert — c'est un geste de triage, pas un scrutin (ça, c'est réservé à la priorité roadmap, voir [`GOVERNANCE.md`](./GOVERNANCE.md#-roadmap-voting)).

## 🔧 1. Set up

Requires **Node 22.12+**, **pnpm**, **jq**, **python3**, and **pipx** (`gh` and the Claude/Codex CLI optional).

```bash
make setup   # deps + git hooks, registers a local marketplace, installs plugins into Claude + Codex
```

`make` lists every target; `make doctor` and `make check` verify the environment and run the pre-commit checks (including the Markdown link checker).

## ✏️ 2. Make your change

- **Test locally** — neither tool hot-reloads the checkout (both serve a cached copy). After editing, run `make reload` (or `PLUGIN="aidd-refine aidd-pm"` for a subset), then restart the session — `/reload-plugins` covers a Claude-only edit to an existing skill.
- **Commit** — `<type>(<scope>): description`, one scope per commit (split cross-plugin changes). The types, scopes, and rules live in [`aidd_docs/memory/vcs.md`](aidd_docs/memory/vcs.md#commit-convention) (mirrors `commitlint.config.cjs`); the **type** drives the release → [`RELEASE.md`](./RELEASE.md).

## 📜 Principes

- **Pas de slop** — relis chaque ligne avant de la proposer ; pas de contenu généré et jamais vérifié.
- **Économise le token** — réponses et prompts concis, pas de remplissage.
- **Suis la structure des skills** — anatomie dans [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), scaffold via `/aidd-context:04-skill-generate`.
- **Fais évoluer la memory** — ta PR change une convention ? Mets à jour [`aidd_docs/memory/`](aidd_docs/memory/) avec.

## 🔀 3. Open a pull request

- **Branch off `next`, target `next`** — only `hotfix/*` branches off `main` for urgent production fixes. The branch prefix alone decides the target → [routing table](aidd_docs/memory/vcs.md#types).
- **Fill the PR template** — explain *what* changed and *how* you solved it; skip re-asserting the conventional title and hooks (CI already enforces them).
- **Label** follows your branch kind (the PR skill applies it automatically); add `security` when relevant.
- **A Habilité review gates every merge** ([`CODEOWNERS`](./.github/CODEOWNERS)) — no one merges their own PR. PRs squash-merge on the conventional title. Decision rules → [`GOVERNANCE.md`](./GOVERNANCE.md#-code-decisions-merging).

## 🚀 Releases

The `main`/`next` model, weekly cadence, and hotfix flow → [`RELEASE.md`](./RELEASE.md). A release ships **8 independently-versioned packages** (root `aidd-framework` + the 7 plugins; `aidd-ui` is alpha) plus per-tool archives; full breakdown → [`MAINTAINERS.md`](docs/MAINTAINERS.md#-releases).

## 🐛 Reporting a bug

[Open a Bug report](https://github.com/ai-driven-dev/framework/issues/new/choose) — auto-added to the [Roadmap board](https://github.com/orgs/ai-driven-dev/projects/8). Want to contribute a change instead? Use the flow above. For usage questions use [Discussions](https://github.com/ai-driven-dev/framework/discussions), not issues (see [`SUPPORT.md`](./.github/SUPPORT.md)).

## 📚 Reference

- **Build a plugin** → [`docs/CREATE_PLUGIN.md`](docs/CREATE_PLUGIN.md)
- **Architecture & terms** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/GLOSSARY.md`](docs/GLOSSARY.md)
- **Patterns to follow** → a minimal plugin [`aidd-refine`](plugins/aidd-refine/), a router skill [`00-onboard`](plugins/aidd-context/skills/00-onboard/), agents [`aidd-dev/agents`](plugins/aidd-dev/agents/)
- **Per-tool builds** → source files use Claude Code syntax; the `aidd-cli` maps each surface to its per-tool equivalent at release. `name` / `description` / `argument-hint` are universal; other frontmatter keys (`model`, `color`, `paths`, …) are tool-specific and ignored where unsupported.

---

■ [Back to framework](./README.md)
