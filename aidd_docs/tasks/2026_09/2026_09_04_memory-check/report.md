# Memory check — the repository

The repository's own bank and public docs, read against the tree at commit `04348966`. Ten
memory files on disk, no gap, no orphan. Nothing was changed.

The `cli/` bank was rewritten first and is current; its own report sits beside this one.

## Findings

### aidd_docs/memory/architecture.md

| Finding | Evidence |
| --- | --- |
| 7 plugins, twice — the table and the diagram | `marketplace.json` lists 8; `release-please-config.json` versions 8 plugin paths |
| `kanban/` is bundled into the CLI from source | `tsconfig.include` is `src`/`tests`, the tsup entry is `src/cli.ts` alone, `cli/src/` never names kanban |
| `cli/` and `kanban/` are released here | `kanban/package.json` is `private: true` and has no release-please package |
| the taxonomy has no Observation layer | `docs/ARCHITECTURE.md`, which this page names as canonical, gives `aidd-telemetry` its own layer and its own rule |
| 8 plugins reads as 8 installable | `aidd-ui` is alpha and off the install path, `aidd-telemetry` beta and opt-in; the repo's own settings enable 6 |
| a plugin never holds its own tests | stated in full by `testing.md`; a parallel copy |
| bundled hooks run Node, so no node means no memory refresh | it also costs the run journal now: the telemetry plugin binds three more events |
| the `KanbanCommandDeps` injection point | a path inside the child's tree; the child's own page owns that decision |

### aidd_docs/memory/codebase-map.md

| Finding | Evidence |
| --- | --- |
| `kanban/` is bundled into the CLI, never published alone | the second half is true, the first is not |
| `aidd_docs/` is the bank plus task documents | it also holds `runs/`, `product/`, `specs/`, `recipes/`, `brainstorm/` |
| `.claude/` is absent from the diagram and the table | it registers this checkout as a local marketplace, which is how a contributor dogfoods |
| the plugin row omits the one universal file | every plugin carries `.claude-plugin/plugin.json`, the version release-please bumps |
| `docs/` is durable docs | `docs/prompts-documentation.md` is generated and staged on every commit |
| the memory refresh is the lifecycle entry | telemetry registers three more, plus an OpenCode-only module |

### aidd_docs/memory/cli.md

| Finding | Evidence |
| --- | --- |
| groups `ai`, `ide`, `status`, `restore`, `self-update`, `framework build`, `kanban` | none exists |
| the whole `telemetry` group is absent | 7 leaves, one carrying 4 more |
| `sync` and `translate` unnamed | both are top-level groups |
| `plugin` and `marketplace` verbs | names 5 of the 8 real ones, and `add` without `install` is what teaches the wrong command |
| Ink and React for the interactive views | those are kanban's dependencies |
| `kanban/` must resolve before any `cli` job | it resolves nowhere in `cli/` |
| enumerating commands at all | the child page refuses to, on purpose, and that refusal is what keeps it true |

### aidd_docs/memory/project-brief.md

| Finding | Evidence |
| --- | --- |
| `aidd plugin add`, `aidd ai`, `aidd ide` | `plugin add` errors; `ai` and `ide` are `setup` flags |
| `aidd framework build` | unknown command |
| `aidd kanban` | unknown command |
| `aidd-dev` has 8 skills, `aidd-pm` 6 | 11 and 10 |
| telemetry, `aidd-refine` and `aidd-ui` unnamed | all three ship |
| the five AI tools are listed, VS Code is not | it is a supported IDE target |
| no pointer to its child | every other paired page has one |

### aidd_docs/memory/testing.md

| Finding | Evidence |
| --- | --- |
| run the scripts suite as `node --test 'scripts/__tests__/*.test.js'` | the hook wraps it, because unwrapped it can write into this repository's own `.git/hooks` — and `.git` is in no history |
| `cli/` has three tiers | four |
| kanban shares the CLI's tiers | its `test` is a bare `vitest run`, and the two share no code at all |
| `cd cli && pnpm test` builds first | it does not, deliberately: a concurrent rebuild corrupted golden captures |
| `pnpm exec lefthook run pre-push` is what CI runs | CI runs the whole pre-commit over the whole tree, plus coverage, smoke, jscpd, Windows, kanban and an identifier-join probe |
| the `identifier-join` gate is named nowhere | it installs the real Claude Code and runs a root-owned probe |
| no way to run the kanban suite | and no lefthook glob covers it, so a kanban-only change fires no local gate |
| tools, fixtures and the substitution rule | all three restated from the child page this one defers to |

### aidd_docs/memory/coding-assertions.md

| Finding | Evidence |
| --- | --- |
| `cli knip:production` | the script is `knip` |
| the pre-commit list omits three commands | `context-reference-form`, `cli-architecture`, `cli-layering` all fire |
| lint and typecheck run when `cli/` or `kanban/` changed | both globs are `cli/**`; a kanban-only change fires neither |
| the hook regenerates catalogs and README counts | it also regenerates and stages `docs/prompts-documentation.md` |
| nothing says CI re-runs the whole hook over the whole tree | that is what makes it a requirement rather than a courtesy, and what still gates a `--no-verify` commit |

### aidd_docs/memory/deployment.md

| Finding | Evidence |
| --- | --- |
| `promote.yml` is the only manual entry | two more declare `workflow_dispatch` |
| commitlint runs on pull requests | it also lints main's tip, and the promote flow depends on that |
| `cli-ci.yml` runs typecheck, lint, test, build, knip | also arch, coverage, smoke, jscpd, kanban, Windows, identifier-join — and its filter covers the telemetry plugin and `scripts/__tests__/` |
| archives go to Releases and GitHub Packages | Packages receives only the npm package, best-effort; every archive goes to Releases |
| tags are shaped `<plugin>-v<semver>` | there is also a root umbrella tag and `cli-v<semver>` |
| a release bumps the marketplace and each plugin | only paths with commits bump; the root bumps every cycle |
| `build-plugin` produces one archive per released path | the matrix lists 6, release-please releases 8 |
| the CLI is pinned for the per-tool build | true, and load-bearing: `framework build` no longer exists, so the pin cannot move |
| the release PR is auto-merged | it takes `--squash --admin` under the App token, because the branch policy refuses a plain merge |
| `star-history.yml` absent, and the umbrella-latest step absent | both exist, the second because releases are created unordered |

### aidd_docs/memory/vcs.md

| Finding | Evidence |
| --- | --- |
| `next` is the default target for day-to-day work | GitHub's default branch is `main`, so `gh pr create` with no `--base` targets `main` |
| `framework` and `marketplace` are the scopes that bump the marketplace | release-please attributes by changed path, never by scope |
| subject max 72 | the gate rejects at 101 |
| no `ci/` row in the routing table | the repo's own automation emits `ci:` commits and `ci/*` branches exist |
| the automation-owned prefixes are unnamed | `promote/*` targets `main`, `back-merge/*` targets `next`, and neither follows the format |

### aidd_docs/memory/backlog.md

| Finding | Evidence |
| --- | --- |
| task documents are read by `aidd kanban` | no such command |
| the board is Todo / In review / Done | the live board also offers Ideation and In Progress |
| priority is set by a community vote | `GOVERNANCE.md` calls the public reaction a signal, not a counted vote |
| a milestone closes once its issues are | an empty one is deliberately left open, and it runs on a Monday cron |
| `.github/labels.yml` is the source of truth | nothing syncs it; the file says drift is reconciled by hand |
| a Thursday due date | undecidable from the API alone — three of seven milestones read Friday in UTC |

### aidd_docs/memory/ecosystem.md

| Finding | Evidence |
| --- | --- |
| npm, Packages, release-please and Dependabot carry no owner file | all four are documented in `deployment.md` |
| Discord carries an owner annotation naming no file | no memory file documents it, and the edge already carries the access mode |
| `release created` reaches npm and Packages | the publish is gated on the released paths, never on a release event |
| the release-please edge carries a trigger, not a payload | what moves is the Release PR, then the tags |
| no `gh` node | it is how both actors reach GitHub and the board |
| no Discussions node | `backlog.md` makes it the authority for ideas |
| no host AI tools | nine per-tool distributions ship, and CI installs one of the hosts |
| no human edge to GitHub | a human starts the promotion from the Actions tab |
| the Packages edge omits that it is best-effort | `continue-on-error` |

### Public docs

| File | Finding | Evidence |
| --- | --- | --- |
| `docs/MAINTAINERS.md` | `aidd-cli framework build`, and "bump it deliberately" | the command no longer exists; following that sentence breaks the per-tool release job |
| `docs/MAINTAINERS.md` | 8 packages, root plus 7 plugins | 10 |
| `docs/MAINTAINERS.md` | the do-not-hand-edit list | omits the generated prompts document |
| `docs/MAINTAINERS.md` | a `GOVERNANCE.md` anchor | the heading carries no such suffix |
| `docs/ARCHITECTURE.md` | the memory hook is `update_memory.cjs` | it is `.js` |
| `docs/ARCHITECTURE.md` | a journal line is `session_start`, `turn_end` or `file_written` | three more record types ship, one of them the very thing the FAQ promises |
| `CONTRIBUTING.md` | two anchors into `vcs.md` | neither heading exists |
| `docs/FAQ.md` | two directories a person can delete | a third file survives, and the command that removes all three is never named |
| `README.md` | — | nothing drifted; its counts are hook-generated |

## Notes

- Two findings are executable traps, not stale prose. `docs/MAINTAINERS.md` instructs a
  maintainer to bump a pin whose old command is the only one that works. `testing.md` gives
  the unwrapped form of a suite the hook wraps precisely because it can destroy a hook
  install nothing can restore.
- Two guards have the same shape of blind spot as the CLI's did. `scripts/check-markdown-links.js`
  discards a `#fragment` before resolving, so no gate has ever looked at an anchor — five are
  dead. And no gate reads the repository bank for dead paths at all: the CLI's
  `referenced-paths` ratchet is scoped to `cli/`.
- `.github/workflows/ci.yml` installs kanban's dependencies before building the CLI, in the
  job that publishes to npm, under a comment saying the CLI bundles kanban from source. Three
  facts contradict it. The step is dead weight on the release path, and removing it is a
  change to that path, so it is recorded rather than made.

## Applied

Every finding above is fixed in place. So are the four things this check found that the
review had not:

| Was | Now |
| --- | --- |
| `check-markdown-links.js:239` discarded every `#fragment`, so five dead anchors passed CI for months | it resolves them against the target's headings, GitHub's slug rule, `#L119` line fragments excluded. The five are repaired; a sixth, `docs/MARKETPLACE.md`, was found by the gate itself |
| No gate read this bank for a path that names nothing | `scripts/check-referenced-paths.js`, wired into pre-commit. It found one: `testing.md` named `scripts/smoke-tools.sh`, which lives under `cli/` |
| `lefthook.yml` ran the scripts suite twice, `scripts-tests` wrapped and `scripts-test` bare | one job. It keeps the wrapper, the bare job's wider `{scripts,plugins}/**` glob and its count guard |
| `ci.yml` installed kanban's dependencies before publishing to npm, and built archives for six of the eight released plugins | both gone. `release-covers-every-plugin.test.js` now fails if the matrix and `marketplace.json` disagree |

`AGENTS.md` was also staged carrying the `@` import form, which is the exact regression
`fix(framework)` #751 closed. The tools reading that file resolve a markdown link and not an
`@` line, so the memory block would have loaded nothing. Restored to its committed form.

## Evidence

Each guard was proved by the mutation it exists for, not by passing:

- Re-pointing `CONTRIBUTING.md:49` back at `vcs.md#commit-convention` turns the link check red,
  and only that link.
- Re-writing `testing.md:40` back to `scripts/smoke-tools.sh` turns the path check red.
- Staging a file under `plugins/aidd-dev/` fires `scripts-tests`, which the old narrow glob
  would have skipped.
- The release matrix test was written against the six-plugin list and failed before the two
  were added.

The path gate reads files, never directories: a token with no extension is skipped, so
`plugins/` and `scripts/__tests__/` stay outside its reach. It also reads the whole tree on
every run - the hook's glob decides only whether it runs.

One line of it was a shipping decision rather than a CI fix: `build-plugin` now attaches a
public archive for `aidd-ui`, whose own description reads "ALPHA, not ready for use". Raised
and kept — release-please already tags that plugin, and a tag with no archive is the odd
state, not the archive.

`pnpm exec lefthook run pre-commit`, 12 jobs green. Links 0 broken in 734 files, anchors 0
broken in 902, referenced paths 0 dead in 32. `cd cli && pnpm build` succeeds with
`kanban/node_modules` moved aside, and the bundle carries no kanban symbol.

Not run this pass: `pre-push`, which is the `cli` suite. Nothing under `cli/src` or
`cli/tests` changed here.
