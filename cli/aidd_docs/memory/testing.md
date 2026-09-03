# Testing Guidelines

## Tools and Frameworks

- Framework: `vitest` with workspace configuration (`vitest.workspace.ts`)
- Runner: `pnpm test` (`vitest run`; the e2e project builds its own binary — see below)
- Test files: in `tests/` directory (not co-located with `src/`)
- Watch mode: `pnpm test:watch`
- Mutation testing: `pnpm test:mutation:<scope>` (Stryker, one scope per context)

## Test Pyramid — 3 Tiers

Tier is identified by **file extension**, not folder:

| Extension               | Tier        | Scope                                      |
| ----------------------- | ----------- | ------------------------------------------ |
| `*.unit.test.ts`        | Unit        | Domain models, value objects, pure functions |
| `*.integration.test.ts` | Integration | Use-cases (application) + adapters (infra) |
| `*.e2e.test.ts`         | E2E         | Full CLI journeys — main happy paths only  |

The test tree mirrors the source tree: a test lives at the same path under `tests/` as the
file it covers under `src/`. That is asserted nowhere, but it is why this document names layers
rather than directories — the layers are stable, the directories moved once already and the
paths written here went stale without anyone noticing, in a file loaded into every session.

### Tier 1 — Unit (`*.unit.test.ts`)

- Scope: a context's `domain/` and the `kernel/` — value objects, pure functions, exhaustive
- No mocks, no I/O, no infrastructure dependencies
- `describe.concurrent()` forbidden
- Property tests use `fast-check`; the manifest's live beside the domain they cover

### Tier 2 — Integration (`*.integration.test.ts`)

Two sub-scopes:

**Application** (a context's `application/`):
- Use-cases with real temp filesystem
- Mock all ports via in-memory implementations from `tests/helpers/ports/`
- Never mock: `FileSystem`, `ManifestRepository`, `Hasher`
- Covers specific cases NOT covered by E2E: conflict resolution, non-interactive branches, edge cases

**Infrastructure** (a context's `infrastructure/`, and `runtime/`):
- Adapters tested in isolation with mock server responses or file fixtures
- One file per adapter
- Covers technical behaviors not visible in E2E (error parsing, retry logic, format transformation)

### Tier 3 — E2E (`*.e2e.test.ts`)

- Scope: main user journeys only — 5 to 10 scenarios per command max
- Full CLI invocation via `runCli()` from `tests/e2e/helpers.ts`
- `describe.concurrent()` required
- `try/finally` required for cleanup
- No edge cases (those belong in integration)

E2E files live in `tests/e2e/*.e2e.test.ts` — one per journey (persona, greenfield setup,
clean, plugin install/create, update, command-surface matrices,
framework build). List them live: `ls tests/e2e/*.e2e.test.ts`. Each new command journey
adds one file here.

## Test Fixtures

- `tests/fixtures/framework/` — minimal synthetic fixture
- `tests/fixtures/framework-real/` — pinned real framework tag; used for E2E and integration tests requiring real plugin content (plugins: `aidd-async-dev`, etc.)
- `scripts/refresh-framework-fixture.sh` — updates pinned real fixture

## Test Count

Counts drift fast — read them live, don't trust a snapshot:

```shell
find tests -name '*.unit.test.ts' | wc -l        # unit files
find tests -name '*.integration.test.ts' | wc -l # integration files
find tests -name '*.e2e.test.ts' | wc -l         # e2e files
pnpm test                                         # total tests passing
```

Shape stays pyramid: unit ≫ integration > e2e. Measured 2026-09-02: 69% unit, 23%
integration, 6% e2e, 1% architecture.

`vitest run` runs **every** project, e2e included — `--project=e2e` selects a subset of
that same total, it does not add to it. Reporting "N tests plus the e2e ones" double
counts.

## Running Tests

```shell
pnpm test:unit        # domain models only
pnpm test:integration # use-cases + adapters
pnpm test:e2e         # functional journeys
pnpm test             # all tiers
pnpm test:mutation:kernel        # Stryker, one context at a time (minutes each)
pnpm test:mutation:framework     # scopes: see mutation-scopes.json
```

### Concurrent vitest runs don't share a binary

The golden suites capture the same command twice and compare the bytes, which is how they
prove a snapshot is deterministic. That used to break under two concurrent vitest
invocations: `pnpm test` built `dist/cli.js` (`clean: true`) before every run, and every
e2e file read that same shared path, so a second run's rebuild could delete and rewrite
the binary the first run's golden suites were still reading mid-capture — the
determinism test then reported a difference that was not there. Seen twice, both times
chased as a phantom, before the cause was measured.

Fixed by removing the sharing rather than serialising the runs: `tests/e2e/global-setup.ts`
builds a private binary per e2e run, in a gitignored `.e2e-build/` under `cli/`, and
publishes its path via
vitest's `provide`/`inject`. The directory sits inside the package on purpose:
`skipNodeModulesBundle` leaves the dependencies external, and Node resolves those by
walking up from the built file, so a build outside `cli/` dies on `commander`.
`tests/e2e/helpers.ts` reads that published path — no fallback
to `dist/cli.js`, so a run started outside the e2e project throws naming the global setup
instead of silently reading the shared file. `tests/architecture/no-shared-binary.arch.test.ts`
holds the boundary: no file under `tests/` may resolve a path into `dist/`. `pnpm test` and
`pnpm test:e2e` no longer run `pnpm build` — nothing in a test run reads `dist/` any more.
Two vitest invocations at once are safe.

`AIDD_BUILD_OUT_DIR` accepts only `dist` or a directory under `.e2e-build/`; anything else
is refused with an error. The build empties its target before writing, so an out dir
pointed anywhere else destroys that directory's contents while exiting 0, and a binary
built outside the package cannot resolve its externalised dependencies anyway.

`tests/e2e/global-setup.ts` and `vitest.mutation.config.ts` are knip entry points: vitest
and Stryker load them from configuration, which knip cannot follow, and without the
declaration it reports them as unused and fails the pre-push gate.

### Mutation runs one scope at a time

`mutation-scopes.json` is the single declaration: a glob per context, plus what is left out
and the reason. `scripts/run-mutation.mjs <scope>` runs one, files its html and json report
under `reports/mutation/<scope>/` — Stryker writes to one path, so five scopes in sequence
would otherwise leave only the last score — and removes `.stryker-tmp` afterwards, run or
crash. `stryker run` on its own is not the entry point and mutates whatever it likes.

`tests/architecture/mutation-covers-source.arch.test.ts` holds the declaration honest: every
`.ts` under `src/` matches a scope or a declared exclusion, every exclusion carries a reason,
every scope matches something, `package.json` runs every scope and nothing more, and
`stryker.conf.json` may not grow its own `mutate` again.
That last rule exists because it used to name seventeen kernel files one by one, and a file
added to the kernel escaped mutation in silence — the score did not drop, because the mutants
that would have died were never generated.

Never a gate. The score is read; what is enforced is that it exists and covers everything.

### Read the suite count, not only the test count

A suite that fails before producing a single test contributes **zero** to the failure
count. Vitest then reports `numFailedTests: 0` while every test in that file is silently
absent from the run. Measured: two suites whose relative path to a fixture stopped
resolving after a move took fifteen tests out of a run that reported itself green.

A run is green only when both hold:

```
numPassedTests  === numTotalTests
numPassedTestSuites === numTotalTestSuites
```

Moving a test file is when this bites, because a path resolved against `import.meta.url`
or a relative `readFileSync` depends on the file's depth. Check those before trusting a
count.

## Naming Rule

Test names must describe user-visible or system-level behaviour:

- Banned: "calls execute()", "returns Y", "throws an error"
- Required: "installs tool when not present", "fails in non-interactive mode without --tools flag"

`describe` blocks must not be named after the class under test — use a behavioral label.

## Mocking and Stubbing

- Never mock functional behavior
- Application integration: mock all ports via in-memory implementations from `tests/helpers/ports/`
- Infrastructure integration: mock only the HTTP/external layer
- E2E: no mocks — full real CLI binary invocation

## Smoke / dogfood install isolation

- Smoke harness: single `pnpm smoke` → `scripts/smoke-tools.sh`. Drives the real built binary across the full command matrix (all leaf commands × tools); robust `perl alarm` per-command timeout + `grep`-based content guards; coverage-gated.
- Smoke-tests and dogfood CLI installs (`ai install`, `marketplace add`, `plugin install`) MUST run in a fresh `/tmp/<name>` dir with `git init` — NEVER in the repo root.
- In-repo installs leak tracked per-tool residue (`.codex/`, `.cursor/`, `.github/copilot/`, `.opencode/`, `opencode.json`, `.vscode/`) that gets committed by accident (cleaned in PR #276).
- This repo is Claude-only: only `.claude/` and `.aidd/` are legitimate in-repo install artifacts.
- If an in-repo per-tool install is unavoidable for a test, gitignore the non-Claude install dirs.
- A smoke case counts only once **executed** against the real binary — a plausible-looking guard can be silently dead (e.g. a filesystem-find heuristic that returns empty). Pick a tool's tracked file from the manifest (the source of truth), never by walking the filesystem.
- **Native-activation tools touch USER-GLOBAL state, not just the project dir.** `codex`/`copilot` plugin installs land in `~/.codex` / `~/.copilot` (`claude` in `~/.claude`). Sandbox them per run — `codex` honors `CODEX_HOME`, `copilot`/`claude` honor `HOME`, aidd's own user config honors `AIDD_USER_CONFIG_DIR` — or snapshot+restore the real dir. A fresh `/tmp` project dir alone does NOT isolate these. (This work polluted the repo + `~/.copilot` twice before the env-sandbox was right.)
- **Verify tool integrations against the real tool's CLI/IDE, not code+doc inference.** Whether a tool loads a project config is empirical: probe the real tool (`codex debug prompt-input`, `opencode debug skill`, `copilot plugin list`, the Cursor/VS Code plugins panel). Inference from the source + vendor docs was wrong twice here (Cursor assumed broken but works; Copilot assumed fully inert but registers the marketplace). Green unit/integration tests prove aidd's output shape, not that the tool consumes it.

## Golden / snapshot machine-independence

- Golden/snapshot tests MUST be machine-independent. Never snapshot a value derived from an absolute path — including content hashes computed over path-bearing content.
- Symptom of violation: passes locally, fails CI with a different hash (different absolute path on the runner).
- Fix pattern + full detail: `.claude/skills/test/references/golden-machine-independence.md` (recompute hash over normalized content).
