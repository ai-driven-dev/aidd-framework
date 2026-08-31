# Coding Assertions

The checks that must pass for code to count as done. Minimal, run after every change.

## Before commit

The fast gate, wired in `lefthook.yml`.

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-commit` | JSON and YAML validity, skill frontmatter and argument hints, context imports, markdown links, `scripts/` tests, then `cli lint` and `cli typecheck` when `cli/` or `kanban/` changed |
| 2 | `pnpm exec commitlint --edit` | The commit message against `commitlint.config.cjs` |

The same hook also regenerates each plugin's `CATALOG.md` and the README counts, and stages them.

## Before push

The heavier gate.

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-push` | `cli knip:production` then the full `cli` suite, when `cli/` changed |

## Behavior

A feature is done only when every gate above is green. If a fix is needed, spawn one agent per failing assertion (typecheck, tests, rules violated on a category) rather than one agent for all of them.
