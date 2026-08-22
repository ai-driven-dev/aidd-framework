# Measurements — the telemetry layer on Linux

Closes the Linux half of issue #707. Every entry below records a probe that actually ran, in
a real Linux container, never a reading of documentation. The Windows half of #707 is
untouched by this file — nothing here says anything about Windows.

## Bounds

Two different claims, kept apart throughout: **"the plugin and the CLI behave on Linux"**
(what this file establishes) is not **"the chain works on Linux"** (what it does not — no
session on any of the five AI tools was run, because none of their CLIs is authenticated in
a container, and authenticating one is outside what this probe can do). Everything below the
tool boundary — hooks, the journal, the local reader, the switch, the checker — was exercised
for real. Everything above it (an actual Claude Code / Codex / Copilot / Cursor / OpenCode
session) was not, and is not claimed to have been.

A second bound, found while setting up rather than assumed going in: every container run here
is **linux/arm64** — the only architecture this Docker daemon (OrbStack, on this Apple
Silicon host) runs. GitHub Actions' `ubuntu-latest` runners, where this repo's own CI already
runs on every push, are **amd64**. "Runs on Linux" below means arm64 Linux, musl and glibc
both; whether anything differs on amd64 Linux is not established by this file — though the
CLI-CI evidence in "Not fixed, and not because of Linux" below comes from a real amd64 run
and agrees with the arm64 containers on every point it touches.

## Setup

Docker, already available on this host (`node:22-alpine` present; `node:22-slim` pulled for
this task and removed afterward — see Restoration). The repository was `rsync`'d (excluding
`.git`, `node_modules`, `cli/node_modules`, `cli/dist`, `.aidd`) to a scratch directory,
mounted **read-only** into each container at `/repo`, then `cp -r`'d to a writable `/work`
inside the container — no container ever wrote into the working tree. `git init` ran fresh
inside `/work` for each container (the scratch copy carries no `.git`; a throwaway identity
was committed so `git rev-parse --show-toplevel` and `git ls-files` — what `repo.js` and
`journal-privacy.js` actually shell out to — have a real repository to answer from).

**Snapshot boundary, stated because this worktree is shared.** The copy was taken from HEAD
`f6a4b8c35b68f43eb4c0237fd60950e3e67ad722`'s working tree at roughly 16:00 UTC on 2026-08-22.
A different, concurrent agent modified `plugins/aidd-telemetry/hooks/journal.js`,
`hooks/lib/record.js`, `hooks/lib/step-starts.js`, and added `hooks/lib/task-declared.js` and
a matching test block in `scripts/__tests__/aidd-telemetry-journal.test.js`, in this same
uncommitted worktree, after that copy was taken (file mtimes 17:58–18:17; `git status --short`
confirms these are unstaged, not touched by this task). Every container run below reflects the
16:00 snapshot, not the tree as it stands at the end of this file — see "Host gate, and why
it does not read clean right now" for what that means for the pass counts.

Neither base image ships `git`. The plugin's own suite spawns real `git` processes (`getRepoRoot`,
`warnIfTracked`), and without it every test that touches a temp project failed with
`spawnSync git ENOENT` — 116 of 390, on the first pass, before `apk add git` / `apt-get install
git`. Once installed, this cost nothing further. Worth stating plainly for #707's "the git
calls" question: the code's assumption — a `git` on `PATH` behaving as it does on macOS — holds
on Linux once `git` is present, which it will be on any real dev/CI box; a bare `node:22-*`
image is not that box.

## What ran, and passed, on both images

`node:22-alpine` (musl) and `node:22-slim` (glibc), both linux/arm64. Numbers below are
identical between the two unless stated otherwise.

**The plugin's own suite** — `node --test "scripts/__tests__/*.test.js"`:

```
alpine (musl): # tests 390  # pass 390  # fail 0
slim   (glibc): # tests 390  # pass 390  # fail 0
```

Matches the 390 pass on macOS exactly, on both C libraries.

**The markdown-link gate** — `node scripts/check-markdown-links.js`: `0 broken in 805 files`,
both images. (The first pass on alpine showed 2 broken links; that was this probe's own
`rsync --exclude` list dropping a tracked file, `aidd_docs/runs/README.md`, not a repository
or platform fact — fixed by not excluding it, confirmed by rerunning.)

**The CLI's unit and integration suites** — `pnpm test:unit`, `pnpm test:integration`, from
inside `cli/`:

```
alpine: unit 1951 passed (1951) — Test Files 174 passed (174)
        integration 589 passed | 1 skipped (590) — Test Files 58 passed (58)
slim:   unit 1951 passed (1951) — Test Files 174 passed (174)
        integration 589 passed | 1 skipped (590) — Test Files 58 passed (58)
```

**The CLI's e2e suite** — could not be run through its own packaged command
(`pnpm test:e2e`, which is `pnpm build && vitest run --project=e2e`) on either image, for a
reason established below to be unrelated to Linux. Run instead as `npx vitest run
--project=e2e` directly against the `tsup` output already on disk (the build itself succeeds;
only a size-budget script after it fails — see next section):

```
alpine: 180 passed (180) — Test Files 24 passed (24), 166.91s test time
slim:   180 passed (180) — Test Files 24 passed (24), 146.65s test time
```

Includes every telemetry-specific e2e file: `telemetry-hook-install.e2e.test.ts`,
`telemetry-multi-tool.e2e.test.ts`, `telemetry-plugin-matches-cli.e2e.test.ts`,
`telemetry-report.e2e.test.ts`, `telemetry-journal-gitignore.e2e.test.ts` — all pass, on both
images, using the CLI's own synthetic-fixture route (not a real tool session — see Bounds).

## Not fixed, and not because of Linux

Two things blocked a clean run of the CLI's own commands, on both container images. Both are
declared here rather than silently worked around, and neither was fixed: per this task's own
instruction, only something **genuinely broken on Linux** gets fixed, and both of these are
broken identically everywhere, already, independent of this probe.

**1. `pnpm install` from `cli/` silently installs the wrong project's dependencies.**
`pnpm-workspace.yaml` is new on this branch (`git log -1 --format=%H -- pnpm-workspace.yaml` →
`481d67dfb4cbec8db41a5a531fa6360ee186b8bd`), deliberately has no `packages:` list (its own
comment: *"cli/ and kanban/ install independently... making them workspace members would
change how their dependencies resolve"*), and yet its mere presence at the repo root is enough
for pnpm to treat that root as the workspace, regardless of whether `cli/` is a declared
member. Running `cd cli && pnpm install --frozen-lockfile` — the exact command this repo's own
`.github/workflows/cli-ci.yml` runs — resolves and installs the **root** `package.json`'s own
six devDependencies (`+77` lockfile entries, `Virtual store is at: ../node_modules/.pnpm`) and
never touches `cli/`'s real dependencies (`tsup`, `vitest`, `commander`, …). Every downstream
command then fails identically: `sh: tsup: not found`, `sh: vitest: not found`.

Verified not to be a container artifact three ways:
- Reproduces byte-for-byte on a **fresh macOS clone** of this same branch (no container, no
  Linux involved) — same `+77`, same `../node_modules/.pnpm`, same missing binaries.
- Reproduces on **real GitHub Actions `ubuntu-latest`** (amd64, not the arm64 this probe used)
  — [PR #706, run `32566587167`](https://github.com/ai-driven-dev/framework/actions/runs/32566587167),
  triggered by this exact branch: `cli / Build & Bundle Budget`, `cli / Test`, `cli /
  Typecheck`, `cli / Lint`, `cli / JSCPD`, `cli / Knip` all fail the same way, each right after
  `cd cli && pnpm install --frozen-lockfile` reports success. Six for six, on the platform this
  repository's CI already trusts.
- The workaround that unblocked every suite run above — `pnpm install --frozen-lockfile
  --ignore-workspace`, plus a scratch `.npmrc` line (`only-built-dependencies[]=esbuild`) to
  let `esbuild`'s postinstall run, since bypassing the workspace file also bypasses its
  `allowBuilds: lefthook` allowlist — is not a Linux fix; it is a probe-only workaround, not
  applied to the repository, and not what `cli-ci.yml` or the CLI's own README instructs a
  contributor to run.

Not fixed here: it is not Linux-specific (identical on macOS and on amd64 CI), it is not new
information this probe was asked to produce, and it is already visibly broken in this
project's own CI on this exact branch — fixing pnpm workspace topology is a real, scoped
change belonging to whoever owns that regression, not a side effect of a measurement task.

**2. The CLI's own bundle-size budget fails, by 0.85 KB, everywhere.**
Once the workaround above gets past dependency resolution, `tsup` itself succeeds — `dist/cli.js
500.85 KB` — and `scripts/check-bundle-size.mjs` then fails the build: `FAIL: bundle exceeds
budget (500.8 KB > 500 KB)`. The number is identical to two decimal places on alpine, on slim,
and on a fresh macOS build from the same source — deterministic bundler output, not a
platform effect. This is why `pnpm test:e2e` (`pnpm build && vitest run --project=e2e`) never
reaches vitest through its own packaged command on any platform tested; e2e above was run as
`npx vitest run --project=e2e` directly against the already-built `dist/cli.js`, a declared
deviation from the exact command a contributor would type. Not fixed here, same reasoning as
above: 0.85 KB over a 500 KB budget, reproduced identically off any Linux/macOS axis, is not a
Linux defect.

## The real round trip

`aidd_docs/runs/`, `.aidd/config.json`, and `.gitignore` writes below are all inside a fresh
scratch project (`/work/rt-project`, its own `git init`), on both images, with identical
results (paths shown are the alpine run; slim's differ only in the generated ULID and
timestamp).

1. `node .../skills/00-init/scripts/telemetry-switch.js on` → `.aidd/config.json` gets
   `{"telemetry":{"enabled":true}}`; `.gitignore` gains `aidd_docs/runs/` with the printed
   explanation.
2. A real captured payload — `scripts/__tests__/fixtures/claude-code-session-start.json` — with
   only its `cwd` field rewritten to the scratch project's real path (every other field
   untouched; the fixtures' own README already documents that absolute paths are the one thing
   redacted from a capture, so this is the same kind of edit, not a fabricated shape), piped
   into `hooks/journal.js session-start`. **Declared, not hidden:** no captured Claude Code
   `Stop`/turn-end fixture exists in this repository (only `session-start` was captured for
   that host — see `fixtures/README.md`), so the same payload was replayed a second time with
   argv `turn-end` rather than a distinct captured shape. `handleTurnEnd` reads only
   `sessionId` and `cwd` from it (`hooks/lib/record.js:260`), both of which the real fixture
   already carries, so this exercises the real join logic — it is not a claim that a second,
   different real `Stop` payload was captured.
3. Result, one file, both images:

   ```
   {"type":"session_start","at":"...Z","schema_version":2,"run_id":"01M0N3...","project_id":"rt-project","project_remote":null,"tool":"claude-code","vendor_id":"ffde6fda-14a8-4b32-8110-be1f1d13eebf","vendor_field":"session.id"}
   {"type":"turn_end","at":"...Z"}
   ```

4. `telemetry-report.js read` and `report`, and `telemetry-check.js`, all ran clean — no crash,
   no stack trace. `read`: `1 session read, 0 with records`. `check`: `session journalled  ok`,
   `tool files readable  FAIL` (correctly — no real tool ever wrote a cost file in this
   container; this is the tool-boundary limit from Bounds, not a bug the checker missed).

### Permissions — the part #707 called out as unverified

Measured with `stat`, not read from a comment:

```
aidd_docs/runs/                          → 700   (both images)
aidd_docs/runs/<run_id>__<vendor>.jsonl  → 600   (both images)
```

`repo.js`'s comment — *"Windows ignores POSIX modes rather than errors on them," read from
documentation, never observed* — is about Windows and stays exactly that unverified claim for
Windows; on Linux, the modes it sets are the modes on disk. Three separate cases, each run,
not inferred from the code:

- **Fresh directory** (the round trip above): `mkdirSync({mode: 0o700})` creates
  `aidd_docs/runs/` at `700` directly. Confirmed by `stat`, both images.
- **Pre-existing directory at a wider mode — the case `tightenOwnedDir`'s `chmodSync` fallback
  exists for**, per its own comment (*"`mkdirSync`'s `mode` applies only to a directory it
  creates, so a checked-out `aidd_docs/runs/` needs this chmod"*). Forced directly: created
  `aidd_docs/runs/` at `755` before running the hook, then ran `session-start`.

  ```
  before: 755 aidd_docs/runs
  after:  700 aidd_docs/runs
  ```

  The fallback chmod runs and tightens a pre-existing, wrongly-permissioned directory, on
  Linux — not merely on a directory the hook itself just created.
- **`AIDD_RUNS_DIR` set, pointed at a pre-existing directory at `755`**: `tightenOwnedDir`'s
  own early return (*"Never applied to a user-named `AIDD_RUNS_DIR`"*) means the mode is left
  exactly as the user set it — confirmed: `755` before, `755` after, with the journal file
  still written correctly inside it. A user who names their own runs directory keeps
  responsibility for its permissions; the code does not silently override that choice.

The file mode (`sink.js`/`record.js`'s `appendFileSync({mode: 0o600})`) was measured only on
the write that creates the file — the one case the option actually applies (Node/POSIX both
ignore `mode` on an `open()` that does not create the file), so a second write was not
separately re-verified here.

## The skill's script search — busybox and GNU `find`

The exact line from `skills/01-cost/actions/01-locate.md`, run from a repo checkout root with
`~`-prefixed paths that do not exist in the container:

```
find ~/.claude/plugins ~/.codex/plugins ~/.cursor/plugins .github/plugins .claude/plugins .codex/plugins . \
  -type f -path '*01-cost/scripts/telemetry-report.js'
```

**Both busybox (`find` from `alpine:3`'s BusyBox v1.37.0) and GNU findutils 4.9.0 (slim)
resolve it correctly**, on stdout:

```
find: /root/.claude/plugins: No such file or directory   (×6, one per missing ancestor path)
./plugins/aidd-telemetry/skills/01-cost/scripts/telemetry-report.js
```

Exit code is **1** on both — from the six missing-path warnings on stderr, not from the search
itself — which the action's own usage (piping stdout through `head -1`, never checking the
exit code) already tolerates. This is a reassuring result the task explicitly flagged as
worth finding either way: busybox's `find` is not GNU `find`, but the specific invocation this
skill uses needed nothing GNU-only, and it was run, not assumed.

## Where the figures land

`sink.js`'s `rootDir()` — `process.env.AIDD_USER_CONFIG_DIR || path.join(process.env.HOME ||
os.homedir(), ".config", "aidd")` — measured directly, both images:

```
HOME=/root, os.homedir()=/root
resolved (no XDG_CONFIG_HOME set):        /root/.config/aidd
resolved (XDG_CONFIG_HOME=/xdg-was-here): /root/.config/aidd   — identical, unchanged
```

`~/.config/aidd` is exactly XDG's own convention for this. `XDG_CONFIG_HOME` being set makes
no difference to the resolved path — confirmed above, both with and without it set — because
`sink.js` never reads that variable; it consults only `AIDD_USER_CONFIG_DIR`, `HOME`, and
`os.homedir()`. `AIDD_USER_CONFIG_DIR` is the code's own documented override for exactly this
case (a user who wants the figures somewhere else). Stated as a fact for whoever writes the
Linux section of `docs/telemetry-limits.md`: the default path matches XDG's convention by what
the hardcoded `.config` segment happens to spell, not because `XDG_CONFIG_HOME` is consulted;
overriding it requires `AIDD_USER_CONFIG_DIR`, not the XDG variable a Linux user might
otherwise expect to work here. Whether that gap is worth closing is that document's call, not
this one's.

## What changed

Nothing, by this task. Every suite above — the plugin's own 390 (on the 16:00 snapshot), the
CLI's 1951 unit + 590 integration + 180 e2e, the round trip, the permission modes (including
both `chmodSync` branches), the `find` line, the sink resolution — passed on Linux, on both
musl and glibc, without a single code change from this task. Per the instruction to fix only
what is genuinely broken on Linux: nothing found here qualifies. The two real failures found
(pnpm's workspace-root redirect, the CLI's own bundle-size budget) are real, but neither is a
Linux defect — both reproduce identically on macOS and on real amd64 CI, both predate this
probe, and both are out of this task's scope by its own stated rule. `git status --short`
attributes exactly one path to this task: this file.

## Host gate, and why it does not read clean right now

`node --test "scripts/__tests__/*.test.js"` and `node scripts/check-markdown-links.js`, run
against the container snapshot (16:00 UTC, HEAD `f6a4b8c3`): **390 pass, 0 fail**; **0 broken
in 805 files**. That is the state every measurement in this file is about, and it is
unchanged by this task.

Run again at the moment of writing, against the live, uncommitted worktree — which now
includes the concurrent edits named in Setup — the same command reads **389 pass, 12 fail,
401 tests** (`scripts/__tests__/aidd-telemetry-journal.test.js`, task-declared feature). None
of the 12 failures are in a file this task touched or reasoned about; `git status --short`
at the time of this reading shows `plugins/aidd-telemetry/hooks/journal.js`,
`hooks/lib/record.js`, `hooks/lib/step-starts.js`, `hooks/lib/task-declared.js`, and the same
test file as modified/untracked, none by this task (never opened for editing here; confirmed
by mtimes falling entirely after the container snapshot was taken). Not fixed, not touched,
and not reported as this task's own gate failure — but not hidden either: a reader running the
gate command right now will see red, for a reason this file did not cause and does not
resolve.

`node scripts/check-markdown-links.js` against the live worktree: **0 broken in 806 files**
(805 plus this file) — unaffected by the concurrent edits, still green.

## What is now known, and what is still not

**Now known, by observation, on Linux (musl and glibc, arm64):** the plugin's own test suite,
the CLI's unit/integration/e2e suites, the full local chain (switch → hook → sink → reader →
checker) with a real captured payload, the 0700/0600 permission tightening, the skill's
`find`-based script search under both busybox and GNU `find`, and the `.config/aidd` figures
location — all behave exactly as documented, on Linux, independent of macOS. Not observed: any
of that chain closed by a real, authenticated AI-tool session (Bounds), or any of it on amd64
Linux specifically (only inferred from real CI logs that show the pnpm bug agreeing across
arch — nothing else was cross-checked on amd64). **Still completely unknown:** everything
about Windows — the permission story, every hook path, the git calls, the script search — none
of it is touched by this file; that is the other half of #707, unmeasured here on purpose.

## Restoration

Every container ran with `--rm`; none were left running or existing after their command
finished (`docker ps -a` shows none). `node:22-alpine` pre-existed on this host before this
task; `node:22-slim` was pulled for this task and removed afterward (`docker rmi node:22-slim`).
No image layer beyond the two base images was created or left behind. All scratch work — the
rsync'd repository copy, the fresh macOS clone used to isolate the pnpm bug from Linux, every
log — lives under this session's scratchpad directory, never under the working tree; `git
status --short` on the real repository shows nothing from this task.
