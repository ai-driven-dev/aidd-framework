# kanban

Reads a project's `aidd_docs/` frontmatter and shows its task documents as status columns, either as a full-screen interactive view or as a scriptable export.

This folder is not a published package. It is source mounted by the AIDD CLI, which owns the binary, the dependencies and the release.

## Origin

Written by Francois Duval as the standalone `ai-driven-dev/cli-kanban` project, moved here with his agreement. The three task folders under `aidd_docs/tasks/` are his original specs, plans and reviews, kept as the decision record for why the tool is shaped the way it is.

## Use

```bash
aidd kanban [path]              # interactive view, defaults to the current directory
aidd kanban list [path]         # scriptable table
aidd kanban list [path] --json  # the task groups as JSON
```

Filters apply to both views and combine freely:

- `--type <type>` and `--status <status>` match the document's raw frontmatter fields.
- `--progress <progress>` matches a normalized bucket: `todo`, `in-progress`, `done`, `blocked`, `unknown`.
- `--all` also shows task groups whose parent document has no known status.

Each directory under `aidd_docs/` becomes one task group: a parent document (`plan.md` or `master-plan.md`, falling back to `spec.md`, falling back to the first document found) and its sub-documents nested beneath it. A column is rendered per distinct literal parent status; a sub-document's own status never moves its parent into another column.

## Develop

The AIDD CLI type-checks and bundles this folder as part of its own build. Its tests, lint and type-check run here:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

From the CLI folder, `pnpm test:kanban` runs the same suite.

Nothing here may import from `../cli`. Everything the commands need from their host arrives through `KanbanCommandDeps` at registration time.
