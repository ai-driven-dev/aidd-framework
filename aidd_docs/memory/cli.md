# CLI

The `aidd` binary, built from `cli/` and published to npm.

## Commands

- `setup`, `ai`, `ide`: install and refresh AI tool configurations in a target project.
- `framework`: build a target-native distribution of this repo (`--target <tool>`, `--out`, `--flat`). The release workflow calls it at a pinned version, so a CLI release never silently changes framework dist output.
- `plugin`, `marketplace`: add, list, search, update and remove plugins and the marketplaces they come from.
- `kanban`: render `aidd_docs/` task frontmatter as status columns, interactive or `list --json`. Source lives in `kanban/`, bundled from source at build time.
- `auth`, `status`, `doctor`, `clean`, `restore`, `update`, `self-update`: credentials, diagnosis, and upkeep.

## Interface

- Commands register on one `commander` program in `cli/src/cli.ts`; each has its own file under `application/commands/`.
- `--verbose` is global. Read the surface from `aidd --help`, never from a copy.
- Only commands already paying for network I/O carry the update check, listed as `ONLINE_COMMAND_PATHS` in `cli/src/cli.ts`.
- `framework build` refuses to run when `--out` sits inside `--source`.

## Distribution

- `bin.aidd` points at `dist/cli.js`, bundled by `tsup` under a bundle size budget the build enforces (`bundleBudgetKB`).
- Published to npm by OIDC trusted publishing when release-please releases the `cli` path. The GitHub Packages push runs first and is best-effort: it never fails the job.
- `kanban/` never imports from `cli/`: everything it needs arrives through `KanbanCommandDeps` at registration.
