# AI Operating Guidelines

How this team drives AI coding assistants on the `@ai-driven-dev/cli` repo. Repo-specific only; the playbook lives in the framework docs.

## House rules

- Respect the 3-layer boundary: Domain imports zero infrastructure; commands stay thin CLI wiring, business logic lives in use-cases (see `memory/architecture.md`, `memory/codebase-map.md`).
- Runtime dependencies are capped at the 6 justified in `memory/architecture.md`; a new one needs an ADR.
- The command surface is authoritative from live help (`aidd --help`), never from a hardcoded list; treat any count in memory as a hint.
- Never dogfood a CLI install (`ai install`, `marketplace add`, `plugin install`) in the repo root — use a fresh `/tmp` dir with `git init`. Only `.claude/` and `.aidd/` are legitimate in-repo install artifacts (see `memory/testing.md`).

## Validation depth

- Before commit: `pnpm typecheck` → `pnpm lint` → `pnpm knip` → `pnpm jscpd` → `pnpm test` (order in `memory/coding-assertions.md`).
- Before push (Lefthook): `pnpm knip` + `pnpm test`; build must stay under the 500 KB bundle budget.
- Tool-integration claims are empirical: verify against the real tool's CLI/IDE, not source inference (see `memory/testing.md`).

## When the AI drifts

- Reset the session, restate the objective in one sentence, and re-read the relevant memory file before touching code.
- Never bump the version or tag by hand — release-please owns releases (`memory/deployment.md`).

For the general AIDD playbook (planning, review loops, prompting and context hygiene, anti-patterns), see the framework docs: <https://github.com/ai-driven-dev/framework>.
