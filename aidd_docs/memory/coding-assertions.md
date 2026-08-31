# Coding Assertions

The checks that must pass for code to count as done. Minimal, run after every change.

> CLI-specific completion criteria: [`cli/aidd_docs/memory/coding-assertions.md`](../../cli/aidd_docs/memory/coding-assertions.md).

## Before commit

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-commit` | JSON and YAML validity, skill frontmatter and argument hints, context imports, markdown links, `scripts/` tests; `cli lint` and `cli typecheck` when `cli/` or `kanban/` changed |
| 2 | `pnpm exec commitlint --edit` | the message against `commitlint.config.cjs` |

Same hook regenerates each plugin's `CATALOG.md` and the README counts, and stages them.

## Before push

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-push` | `cli knip:production`, then the full `cli` suite, when `cli/` changed |

## Behavior

Done means every gate green. On failure, one agent per failing assertion — typecheck, tests, rules — not one agent for all.
