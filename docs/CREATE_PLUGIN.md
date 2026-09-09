# 🧩 Build your own plugin

Create a new plugin for the AI-Driven Dev marketplace. This is a lean reference — the plugin **anatomy, surfaces, and rules** live in [`ARCHITECTURE.md`](ARCHITECTURE.md); the **contribution flow** in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

```mermaid
flowchart LR
    Scaffold["🏗️ Scaffold plugin dir"] --> Register["📝 Register in marketplace.json + release config"] --> Test["🧪 Try locally"] --> PR["🔀 PR + review"] --> Release["🚀 release-please tags & publishes"]
```

> Adding a *skill* to an existing plugin? Generate it with `/aidd-context:03-context-generate`, then just edit that plugin's `plugin.json` `skills[]` — skip the registration below.

## 🏗️ Scaffold

Pick a name (lowercase, `aidd-<x>`). For the directory shape, `plugin.json`, and `SKILL.md`/action format, follow [Anatomy of a plugin](ARCHITECTURE.md#-anatomy-of-a-plugin). Minimum: `<plugin>/.claude-plugin/plugin.json` + `skills/<NN>-<name>/` (with `SKILL.md` + `actions/`).

## 📝 Register

- **Marketplace** — append an entry to `.claude-plugin/marketplace.json`: `name`, `source` (required, `./plugins/aidd-<x>`), `strict: true`, `metadata: { "recommended": false }` (keeps it off the curated install path until it stabilises; under `metadata` because Claude Code warns on any other field of its own).
- **Release** — add the package to `release-please-config.json` `packages` **and** `.release-please-manifest.json`, or it never versions.

## 🧪 Try locally

```text
/plugin marketplace add .
/plugin install aidd-<x>@aidd-framework
```

Run `/reload-plugins` after editing a skill. `pnpm exec lefthook run pre-commit` validates JSON/YAML/frontmatter and regenerates the plugin's `CATALOG.md`.

## 🚀 Ship

Open a PR with the scope `feat(aidd-<x>): …`. On merge, release-please tags `aidd-<x>-vX.Y.Z` and publishes.

**Guardrails:** English prose, hyphens not em-dashes, no cross-plugin references in descriptions/READMEs, one sentence per `Use when … / Do NOT use for …` cue, and a skill `name:` is the folder slug (`01-hello`) — the invocation token is `<plugin>:<folder>`.

## ❓ Help

Open a discussion on the AIDD Discord, or file a `feat:` issue describing the plugin.
