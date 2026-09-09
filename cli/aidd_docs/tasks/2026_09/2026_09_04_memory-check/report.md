# Memory check — cli/

The bank of the `cli/` package, read against the tree at commit `04348966`. Nine files on
disk, one gap, 112 findings. Nothing under `aidd_docs/memory/` was changed.

## Structure

| File | Gap | Why |
| --- | --- | --- |
| `ecosystem.md` | missing | the capability always holds, and the page would carry what the repo bank does not: the CLI binaries this one drives at runtime — `claude`, `codex`, `copilot`, `opencode`, `gh` |

No orphan: every file on disk is produced by a destination row. Scaffold complete —
`README.md`, `GUIDELINES.md`, `CONTRIBUTING.md`, `memory/README.md`, `internal/`, `external/`.

## Findings

### architecture.md

| Finding | Evidence |
| --- | --- |
| bundle budget is 500 KB | `package.json:47` says 590; the build prints `536.5 KB / budget: 590 KB` |
| all assets inlined, no fs reads at runtime | `tsup.config.ts:88-110` copies `assets/schemas/*.json` beside the binary, `asset-loader.ts:65-77` `readFileSync`s them |
| `.md` files go through the text loader | no `.md` asset exists and no source imports one; the loader feeds nothing |
| Claude reads its settings natively, no CLI step | `profiles/claude/profile.ts` declares `enableVerb`/`disableVerb`/`upgradeVerb`; the CLI drives `claude plugin install` |
| only Codex and Copilot need native activation | Claude is the third; `activateNativeTools` drives whichever binary a profile declares |
| `gh auth token` fires when `method: "gh"` | `auth.ts` defines `AuthMethod = "external" \| "stored"`; there is no `"gh"` method |
| the file never names `telemetry` | a fifth context, 12 ports, 7 use cases, its own command, its own mutation scope |

### auth.md

| Finding | Evidence |
| --- | --- |
| names `application/commands/auth.ts` | the file is `src/presentation/commands/auth.ts` |
| names `infrastructure/adapters/auth-reader-adapter.ts` | the file is `src/runtime/auth/auth-reader-adapter.ts` |
| names `infrastructure/auth/auth-storage.ts` | the file is `src/runtime/auth/auth-storage.ts` |
| `auth.json` shape is `{ method, token?, level }` | `isAuthConfig` also requires `version: 1` and a string `createdAt`; a file of the documented shape reads as unauthenticated |
| the config dir is "overridable via env" | the variable has a name the page omits: `AIDD_USER_CONFIG_DIR` |
| token presence is the only gate | nothing gates on presence; a missing token surfaces at fetch time as `CatalogFetchAuthError` |
| `RequireAuthUseCase` throws when a command needs a token | the class is gone from `src/` |
| an external token is resolved fresh on each read | `AuthReaderAdapter.resolve()` memoizes; `gh` is spawned at most once per process |
| omits the asymmetry of the `gh` spawn | absent `gh` returns null, non-zero `gh` throws `GhCliError` on a 3s timeout |
| omits that `auth.json` is written 0600 / `icacls`, and that failing to restrict throws | `auth-storage.ts:39-56` |

### cli.md

| Finding | Evidence |
| --- | --- |
| the authoritative command list is `project-brief.md` | that page says 22; the binary and the smoke harness both carry 29 |
| top-level `status`, `restore`, `self-update` | all three exit 1 with `unknown command` |
| top-level list omits `framework`, `translate`, `sync` | all three in `aidd --help` |
| top-level list omits the whole `telemetry` group | 7 leaves, one with 4 of its own |
| `ai <tool>` and `ide <tool>` groups | `unknown command`; the tool is chosen by `--tool <id>` |
| `plugin create`, `plugin doctor` | both exit 1 |
| `framework build` is maintainer-only | it exits 1; the author-side build is `aidd translate` |
| output lives in `application/output.ts`, `error-handler.ts` | both are under `src/presentation/` |
| `status --json` emits the full report | `status` does not exist; the only `--json` is on telemetry |
| omits the default entry point | empty argv on a TTY runs `runMenuLoop()` and never reaches `program.parse` |
| all assets inlined, no fs reads at runtime | same schema reads as `architecture.md` |
| Node `>=22.12` and the dual publish | owned by `deployment.md` |
| "no silent failures" | true of commands; the update-check hook deliberately swallows, and one of its three catches drops the reason entirely |

### codebase-map.md

| Finding | Evidence |
| --- | --- |
| the telemetry CLI "is unbuilt", to be spawned as a subprocess | it is built and in-process: 52 files, a registered command, 24 e2e files |
| `global/` holds `update-all` | no such file; it is `update-tools-use-case.ts`, which the tree above names correctly |
| `restore/` has a `plugin` sub-use-case | only `restore-all-plugins-use-case.ts` exists |
| draws `settings-capability.ts`, `mcp-capability.ts`, `plugins-capability.ts` under `tools/domain/` | all three are in `tools/domain/capabilities/` |
| `capabilities/` holds content-translation classes | it also holds the mcp, plugins and settings capabilities |
| `tools/domain/formats/` holds `placeholders` | no such file |
| `translate/domain/formats/` holds `claude-root-path-rewrite` | it moved to `kernel/materialization/`, where the same page places it correctly |
| translate strategies hold `marketplace-strategy-helpers` | deleted; `plugin-source-tree-reader.ts` and `write-skill-tree.ts` are undrawn |
| `runtime/wiring/` is four modules | it holds `telemetry.ts` and `installed-plugins-from-manifest.ts` too |
| `framework.ts` composes three wiring modules | it composes four |
| `runtime/self-update/` holds the version-reader and version-control ports | one is in `kernel/ports/`, the other in telemetry's own `domain/ports/` |
| `runtime/git/` is "token injection" | it is `GitAdapter implements VersionControl`, plus the `GIT_*` stripping |
| `runtime/auth/ports/` is three files | four; `credential-file-store.ts` is undrawn |
| `presentation/display/` renders doctor, restore, setup, status | 9 files, 5 of them telemetry |
| claude and codex profiles carry only their paths files | both also carry a `*-transcript-location.ts` |
| the translator subtree is five files | `project-hooks-materializer.ts` is undrawn |
| the `kernel/` block enumerates every file | `describe-error.ts` is absent from an otherwise exhaustive list |
| `tests/contexts/tools/` covers install/uninstall use-cases | those are under `tests/contexts/framework/application/` |
| `tests/presentation/` covers display | there is no `tests/presentation/display/`; they are at `tests/application/display/` |
| `tests/runtime/` mirrors `src/runtime/` | `platform/` and `project-root/` do not exist there, and `home-dir.unit.test.ts` covers a kernel file |
| the `tests/` tree draws 10 directories | `tests/contexts/telemetry/`, `tests/application/`, `tests/domain/`, `tests/integration/`, `tests/helpers/` are undrawn |
| `tests/fixtures/` holds two dirs | ten |
| the architecture ratchets are ten named tests | seventeen |
| restates the manifest v6 guard, and holds the Launchers decision | both belong to `architecture.md` |

### coding-assertions.md

| Finding | Evidence |
| --- | --- |
| "3-layer architecture: Domain → Application → Infrastructure" | `src/` is `cli.ts contexts kernel presentation runtime`; the tree is organised by bounded context |
| output formatting lives in `application/output.ts` | `src/presentation/output.ts` |
| before commit: typecheck, lint, knip, jscpd, test | the pre-commit hooks are lint, `test:arch`, typecheck, layering; knip and test are pre-push, jscpd is CI only |
| omits `pnpm test:arch` | a pre-commit hook and a required CI job |
| omits the layering check | `pre-commit.cli-layering` runs `node scripts/check-cli-layering.mjs` from the repo root |
| before push: build then test | the hooks are knip then test; build runs on no hook |
| omits two blocking CI gates | `cli-coverage` and `cli-smoke` |
| restates the six runtime deps | `architecture.md` owns that list |

### deployment.md

| Finding | Evidence |
| --- | --- |
| lists only `AIDD_TOKEN` | omits `AIDD_BUILD_OUT_DIR`, `AIDD_SELF_UPDATE_API_BASE`, `AIDD_SELF_UPDATE_NPM_BASE` |
| the build produces `dist/cli.js` | it also copies five schema JSONs the runtime reads; drop them and the CLI breaks |
| bundle budget 500 KB | 590; at 500 the current build would fail |
| pnpm `>= 9` | no file states it; `packageManager` pins 10.14.0 and CI activates latest |
| merging tags `vX.Y.Z` | this package's tag is `cli-v<semver>`; bare `vX.Y.Z` is the root component |
| "the Publish job" fires on a tag | the job is `publish-cli`, gated on `cli` being in `paths_released` |
| publishes to both registries | the GitHub Packages step is `continue-on-error`; only npm is load-bearing |
| publishes with `pnpm publish` and `NPM_TOKEN` | it runs `npm publish`; the workflow says no token is needed and that pnpm is avoided on purpose |
| the command is `aidd self-update` | no such command; the verb is `aidd update` |
| the changelog is best-effort from GitHub | it is dead: wrong repo constant and wrong tag shape, and the error is swallowed |
| biome config at the repo root | it is `cli/biome.json` |
| a `lefthook.yml` with no parent delegation | the only one is the repo root's, and every CLI hook is exactly that delegation |
| pre-commit is lint + typecheck | four commands, not two |
| the git-hooks tables | `coding-assertions.md` owns them, and the two disagree |
| `ci.yml` runs typecheck, lint, test, build, knip, jscpd | those live in `cli-ci.yml`, a workflow this page never names |
| `pnpm test` is build + vitest | it is `vitest run`; `testing.md` records why |
| mutation is a CI gate | it runs on no workflow, and takes a required scope argument |

### project-brief.md

| Finding | Evidence |
| --- | --- |
| twenty-two leaf commands | 29; the smoke guard diffs the list, never the prose count |
| the command sections omit `telemetry` | 7 leaves |
| tracked state is the manifest and hash drift | a project now also carries `.aidd/config.json`, `aidd_docs/runs/`, a machine identity |
| the domain language has no measurement vocabulary | `kernel/measurement.ts` and telemetry's domain define terms the binary speaks |
| "gated by a GitHub token" | `guardRemoteAuth` gates private sources only; the default source is public |
| the framework resolves from GitHub Releases or a tarball | neither exists; the modes are remote git and local path |
| the bank is scaffolded by an `aidd-context` project-init skill | no such skill; it is `02-project-memory` |

### testing.md

| Finding | Evidence |
| --- | --- |
| names `scripts/refresh-framework-fixture.sh` | no such file anywhere in the repo |
| three tiers | four vitest projects; `architecture` is the fourth, with its own script |
| unit is domain and kernel, no I/O | `.unit.test.ts` files sit under `application/` and `infrastructure/`, one reading a fixture off disk |
| integration uses a real temp fs and never mocks the fs, manifest or hasher | 24 of 66 integration files use the in-memory doubles; 29 touch `mkdtemp` |
| `describe.concurrent()` required in e2e | 25 of 39 files use none |
| `try/finally` required in e2e | 12 files have none |
| list e2e files with `ls tests/e2e/*.e2e.test.ts` | the project glob is `tests/**`, so that misses the three golden suites |
| the e2e journey list | 39 files, 24 of them telemetry, none mentioned |
| `global-setup.ts` is a knip entry point | it is not in `knip.json`, and knip reports nothing unused |
| the sandbox rule covers smoke and dogfood | the e2e suite enforces it too, with its own measured PATH helpers and a guard test |
| machine independence is about absolute paths | a second axis is documented in the helpers: the sink lands under `AppData\Roaming` on Windows |
| `tests/fixtures/` holds two dirs | ten |
| 69/23/6/1 measured 2026-09-02 | 70.1/20.0/8.3/1.7 on 2026-09-04; the shape claim survives |
| five mutation scopes | eight |
| one mutation scope per context | three of the eight are not contexts |
| a single `pnpm smoke` | two: `smoke` is hermetic, `smoke:full` adds the remote section |
| restates the per-tool activation mechanism | `architecture.md` owns it; only the testing lesson belongs here |

### vcs.md

| Finding | Evidence |
| --- | --- |
| scopes `cli`, `domain`, `infra`, `install` | only `cli` is in `scope-enum`; the other three warn |
| example `feat(install): …` | that exact string warns |
| the type list omits `build` | config-conventional accepts it |
| branch format `type/ticket-short-description` | the repo bank says `type/short-description`, and no live branch carries a ticket |
| main branch is `main`, `next` unmentioned | every prefix but `hotfix/*` targets `next` |
| merging tags `vX.Y.Z` | this package tags `cli-v<semver>` |
| subject max 72 | the enforced gate is 100 |
| omits the `AIDD-Session-Id` trailer | installed by `telemetry on`, live on 14 of the last 30 commits here |
| omits what would justify a child page at all | that `cli` is this package's only scope, and that a `cli/` change releases `@ai-driven-dev/cli` alone |

## Duplicated facts

| Fact | Home | Copy |
| --- | --- | --- |
| the six runtime dependencies | `architecture.md` | `coding-assertions.md` |
| the git-hook tables | `coding-assertions.md` | `deployment.md` |
| Node `>=22.12`, dual publish | `deployment.md` | `cli.md` |
| token resolution order | `auth.md` | `architecture.md` |
| the manifest v6 guard | `architecture.md` | `codebase-map.md` |
| release tags | `deployment.md` | `vcs.md` |
| conventional commits, 72-char subject | the repo bank's `vcs.md` | `vcs.md` |
| platform, main branch, `gh` | the repo bank's `vcs.md` | `vcs.md` |
| per-tool native activation | `architecture.md` | `testing.md` |
| the Launchers decision | `architecture.md` | `codebase-map.md` |

## Notes

- Three defects found while verifying, none of them in the bank:
  - `src/runtime/self-update/self-updater-adapter.ts:14` names `ai-driven-dev/aidd-cli` and
    fetches `/releases/tags/v${version}`. The repository is `ai-driven-dev/framework` and the
    tag is `cli-v<semver>`, so the changelog request always 404s, and the catch swallows it.
    `aidd update` has never shown a changelog.
  - `tests/architecture/referenced-paths.arch.test.ts:31` matches only paths prefixed
    `src`, `tests`, `kernel`, `contexts`, `presentation` or `runtime`. A citation written
    `application/…` or `infrastructure/…` is invisible to it, which is why three dead paths
    survived in `auth.md` and a fourth in `testing.md`.
  - `.claude/rules/` is in no guard's scope, and four rule files name the pre-refactor tree.
    `07-quality/7-auth.md:24` names `RequireAuthUseCase`, a class no longer in `src/`. A rule
    is injected into every session, so a stale one instructs rather than merely misinforms.
- `ecosystem.md` — the repo bank's own page carries the repository's tools. Whether the
  package's page should exist beside it, carrying the four AI-tool binaries this CLI drives
  and `gh`, is the one thing this run did not settle.
