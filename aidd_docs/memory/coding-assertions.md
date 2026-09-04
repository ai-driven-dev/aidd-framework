# Coding Assertions

The checks that must pass for code to count as done. Minimal, run after every change.

## Before the code

**Write the test first, and watch it fail for the reason it names.** A test written after the
code it covers confirms what was built; only one that failed first can tell you it is
checking anything at all.

Two consequences, both learned by paying for them:

- **A guard ships with the mutation that proves it.** Break the thing the test is named for
  and watch that test — not another — go red. A guard nothing fails for is not a guard, and
  it is indistinguishable from a comment.
- **After any scripted edit, read the file back before running anything.** A replacement
  whose anchor drifted applies to nothing and reports nothing, which is how a field can be
  declared in a type, believed by a display and produced by no code. An inconsistent state is
  worse than a missing feature: nobody designed it, so nobody can reason about it.

Never state in a commit message or a report anything not just observed in output.

> CLI-specific completion criteria: [`cli/aidd_docs/memory/coding-assertions.md`](../../cli/aidd_docs/memory/coding-assertions.md).

## Before commit

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-commit` | JSON and YAML validity, `scripts/` tests, skill frontmatter and argument hints, context imports and reference form, markdown links and the paths the prose names; `cli` lint, architecture, typecheck, layering, knip and tests when `cli/` changed |
| 2 | `pnpm exec commitlint --edit` | the message against `commitlint.config.cjs` |

Same hook regenerates each plugin's `CATALOG.md`, the README counts and `docs/prompts-documentation.md`, and stages them.

Every `cli` job is globbed on `cli/**`. A change under `kanban/` alone fires none of them; run `cd kanban && pnpm test` by hand.

## Before push

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm exec lefthook run pre-push` | `cli knip`, then the full `cli` suite, when `cli/` changed |

`--no-verify` buys nothing: `validate.yml` re-runs the whole pre-commit over the whole tree on every push and pull request.

## Behavior

Done means every gate green. On failure, one agent per failing assertion — typecheck, tests, rules — not one agent for all.
