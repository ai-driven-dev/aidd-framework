# Codebase Map

The macro layout: the top-level areas and what each holds. A map to navigate, not the full tree.

> Where things live inside the CLI is in [`cli/aidd_docs/memory/codebase-map.md`](../../cli/aidd_docs/memory/codebase-map.md).

```mermaid
flowchart TD
    Root["framework/"] --> Plugins["plugins/"]
    Root --> Cli["cli/"]
    Root --> Kanban["kanban/"]
    Root --> Scripts["scripts/"]
    Root --> Docs["docs/"]
    Root --> AiddDocs["aidd_docs/"]
    Root --> Manifest[".claude-plugin/"]
    Root --> GH[".github/"]
```

## Areas

| Path | Holds |
| --- | --- |
| `plugins/` | the product — one dir per plugin, each with `skills/`, optionally `agents/`, `commands/`, `hooks/`, `rules/` |
| `cli/` | the `aidd` binary. Has its own memory bank and `CLAUDE.md` |
| `kanban/` | the task board, bundled into the CLI, never published alone |
| `scripts/` | repository checks and generators, run by lefthook and CI. Tests in `scripts/__tests__/` |
| `docs/` | durable docs — architecture, plugin authoring, glossary, maintainer runbook |
| `aidd_docs/` | this memory bank, plus task documents read by `aidd kanban` |
| `.claude-plugin/` | `marketplace.json`, the version manifest |
| `.github/` | workflows, issue templates, rulesets |

## Entry points

| Entry | Path |
| --- | --- |
| Binary | `cli/src/cli.ts` → `dist/cli.js`, bin name `aidd` |
| Workflow | `plugins/<plugin>/skills/<NN>-<name>/SKILL.md` |
| Memory refresh | `plugins/aidd-context/hooks/update_memory.js`, on `SessionStart` |

## Packages

| Package | Released |
| --- | --- |
| `cli` (`@ai-driven-dev/cli`) | npm, the only published package |
| `kanban` | private, compiled into the CLI. Depends on npm packages only, never on `cli/` |
