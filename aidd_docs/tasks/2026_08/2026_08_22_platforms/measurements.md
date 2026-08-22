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

---

# Measurements — the telemetry layer on Windows

Closes the Windows half of issue #707. No Windows machine is available in this environment
and Docker on macOS cannot run Windows containers, so every number below comes from a real
`windows-latest` GitHub-hosted runner (Windows Server 2025, image `windows-2025-vs2026`),
reached by adding a job (`windows-probe`) to `.github/workflows/cli-ci.yml` and pushing it on
a scratch branch, `ci/windows-probe`, deleted once this file was written. Nothing here is a
guess, WSL, or a container standing in for Windows.

## Bounds

Three, stated up front rather than discovered mid-read.

**This did not need to fix the pnpm-workspace or bundle-budget defects the Linux file
found.** Both were already fixed on this branch by the time this task started — confirmed by
this branch's own `cli-ci.yml` runs on `ubuntu-latest` (`32586490806`, `32590537487`) reading
green, `cli / Build & Bundle Budget` included. Nothing below is about either bug.

**A concurrent agent was live-editing the exact subsystem this task investigates**, in this
same shared, uncommitted worktree, for this task's entire duration: `plugins/aidd-telemetry/
hooks/lib/*`, `skills/{01-cost,02-check}/scripts/lib/*` (consolidating duplicate files into a
new `skills/_shared/`), and matching files under `scripts/__tests__/`. Every finding below
comes from what GitHub Actions checked out from a pushed *commit* — `6fc9f11a` plus this
task's own workflow-only diff — never from that dirty, in-progress local tree, so none of it
is affected by their edits. Named plainly rather than smoothed over: one `git reset --hard
HEAD`, run early on before this pattern was recognized, briefly discarded a snapshot of their
uncommitted work. It was not requested, is not this task's standard practice, and their
process rewrote the lost work within minutes; no further destructive git command touched their
files afterward, and every commit this task made from then on used an explicit pathspec
(`git commit -- .github/workflows/cli-ci.yml`) so as never to sweep up their in-flight changes
a second time.

**Two different claims, kept apart, the same way the Linux file keeps them apart:** "the
plugin's local chain behaves on Windows" (established below, by a real round trip) is not "the
plugin's own test suite, or the CLI's, passes on Windows" (it does not — see "Not fixed" below)
and is not "the chain works with a real, authenticated AI-tool session on Windows" (still
unmeasured, same tool-boundary limit the Linux file names).

## The job, and how many attempts it took

Three pushes to `ci/windows-probe`, three CI runs, each a real finding rather than a retry of
the same thing:

- **Attempt 1** (`32595971659`): the plugin's own suite ran first, went red, and every step
  after it — including the three answers below and the round trip — was silently skipped.
  This is a defect in the job's own step ordering, not a Windows fact, and is what "Attempt 2"
  fixed.
- **Attempt 2** (`32596442400`): every step now ran (`continue-on-error: true` per step, with a
  final step that fails the job iff any real step failed, restoring an honest red/green
  verdict). The round trip ran too — and produced nothing: `telemetry-report.js read` said "No
  session journalled yet," `telemetry-check.js` said the hook had never been observed firing.
  Root cause, found by reading the round trip's own output rather than assumed: this task's
  round-trip step piped the checked-out fixture straight into `journal.js` without rewriting
  its captured `cwd` (`/home/user/probe/project-plugin`, a path from whatever machine captured
  it originally) — a path that exists on no CI runner, Windows or Linux. `getRepoRoot` failed
  against a directory that isn't there, and per `journal.js`'s own "exit 0 no matter what"
  design, nothing was written and nothing said why. A probe-authoring mistake, not a Windows
  finding — the Linux measurements made the identical `cwd` rewrite and documented it; this
  task's first Windows attempt skipped it.
- **Attempt 3** (`32596840364`, final): `cwd` rewritten to `process.cwd()` before piping, the
  same edit Linux made. Every number and every quoted line below is this run's own output.

The job itself did not turn green — see "Not fixed" below for why, in detail, and why that is
the honest result rather than something to paper over.

## The three answers, verbatim from the runner

**1. Where the figures land.**

```
HOME="C:\Users\runneradmin"
USERPROFILE="C:\Users\runneradmin"
APPDATA="C:\Users\runneradmin\AppData\Roaming"
os.homedir()=C:\Users\runneradmin
resolved rootDir(), runner's own HOME=C:\Users\runneradmin\.config\aidd\telemetry
resolved rootDir(), HOME unset (a real Windows machine)=C:\Users\runneradmin\.config\aidd\telemetry
```

A GitHub-hosted `windows-latest` runner sets `HOME`, unlike the plain Windows machine issue
#707 describes — so this task also re-ran the resolution with `HOME` deleted from the process,
the case a real, non-CI Windows machine actually hits. Both land on the identical path here,
because `os.homedir()` and the runner's own `HOME` agree. The figures land at
`%USERPROFILE%\.config\aidd\telemetry` — `C:\Users\<name>\.config\aidd\telemetry` on a real
machine — exactly issue #707's prediction, and not `%APPDATA%\aidd\telemetry`, which is where
a Windows application, and a Windows user looking for one, would expect it.

**2. What POSIX modes actually do.**

```
platform=win32
mkdirSync({mode:0o700}) threw=null
appendFileSync({mode:0o600}) threw=null
chmodSync(dir,0o700) threw=null
directory mode on disk=0666 (repo.js asked for 0700)
file mode on disk=0666 (sink.js/record.js asked for 0600)
```

`repo.js`'s comment is half right. Nothing throws — measured directly, three separate calls,
none of them raised. But nothing is private either: the mode actually on disk is `0666` for
both the directory and the file it wrote, not the `0700`/`0600` the code asks for. This is the
single most load-bearing line this job produced: **the journal's privacy on Windows does not
exist** the way `repo.js`'s comment implies it does. `mkdirSync`, `appendFileSync`, and
`chmodSync`'s `mode` option silently do nothing on Windows beyond what they'd do regardless;
whatever actually restricts who can read a journal file there is the NTFS ACL the containing
directory already carried, unchanged by any of this code, never `0600` in the POSIX sense the
comment's own numbers suggest.

**3. Path handling — does the skill's `find` line resolve on Windows at all.**

Two different, both-real answers, because which shell runs it changes everything:

Under bash (Git Bash, bundled with `windows-latest`, and what a `shell: bash` step — the same
shell Claude Code's own hook execution and most POSIX-oriented automation would use — runs):

```
find: '/c/Users/runneradmin/.claude/plugins': No such file or directory
find: '/c/Users/runneradmin/.codex/plugins': No such file or directory
find: '/c/Users/runneradmin/.cursor/plugins': No such file or directory
find: '.github/plugins': No such file or directory
find: '.claude/plugins': No such file or directory
find: '.codex/plugins': No such file or directory
./plugins/aidd-telemetry/skills/01-cost/scripts/telemetry-report.js
```

Resolves. Byte-for-byte the same shape as the Linux measurements: six benign missing-path
warnings, then the real script path, `~` expanded correctly by Git Bash.

Under plain PowerShell (`pwsh`) — a first-class Windows shell, and the one a `run:` step gets
by default on `windows-latest` when `shell:` isn't set to `bash`:

```
FIND: Parameter format not correct
exit code: 2
```

Does not resolve at all. This is not GNU `find` failing on `~` or on Unix flags — it is
Windows' own bundled `C:\Windows\System32\find.exe`, a 1980s-vintage substring-in-a-text-file
search tool unrelated to filesystem traversal, being the `find` PowerShell finds first, and
rejecting `-type`/`-path` as parameters it does not understand. **Answer to the issue's
question: it depends entirely on which shell resolves the line.** Routed through Git Bash, the
skill's script search works identically to macOS and Linux. Routed through a plain PowerShell
session — which is what a Windows user typing commands directly, or a tool that defaults to
`pwsh`, actually gets — it fails outright, and because the action's own usage only pipes stdout
through `head -1` and never checks the exit code, that failure is silent: the skill finds
nothing and, from the outside, looks identical to the plugin not being installed at all.

## The real round trip

One real captured payload — `scripts/__tests__/fixtures/claude-code-session-start.json`, with
only its `cwd` field rewritten to the runner's real checkout path (`process.cwd()`), the same
single-field edit the Linux measurements made and for the same reason — piped into
`hooks/journal.js` as `session-start`, then replayed as `turn-end` (same declared limitation as
Linux: no captured `Stop` fixture exists for Claude Code, so `handleTurnEnd`'s real join logic
is exercised on the two fields it actually reads, `sessionId` and `cwd`, both present in the
real fixture — not a claim that a second, distinct real `Stop` payload was captured).

Result, one file, inside the checked-out repository itself:

```
{"type":"session_start","at":"2026-08-22T20:30:31Z","schema_version":2,"run_id":"01M0NJNY2346MJAVM4P229ZT11","project_id":"ai-driven-dev/framework","project_remote":"https://github.com/ai-driven-dev/framework","tool":"claude-code","vendor_id":"ffde6fda-14a8-4b32-8110-be1f1d13eebf","vendor_field":"session.id"}
{"type":"turn_end","at":"2026-08-22T20:30:31Z"}
```

`telemetry-report.js read` and `report`, and `telemetry-check.js`, all ran clean — no crash, no
stack trace, on Windows. `check`: `session journalled  ok` (1 of 1 run file carries more than
`session_start`); `tool files readable  FAIL` — correctly: no real Claude Code transcript file
exists on this runner, the same tool-boundary limit the Linux file's Bounds section names, not
a bug the checker missed. **The full local chain — switch, hook, sink, reader, checker — works
end to end on Windows**, for a real captured payload, once the round trip itself passes a `cwd`
that exists.

`telemetry-switch.js on`'s own output, unremarked in the Linux file because there was nothing
notable there, is worth a line here: it correctly found and named `.aidd/config.json` at
`D:\a\framework\framework\.aidd\config.json` — native Windows path separators, no crash, no
special-casing needed in the calling code to get there.

## Not fixed, and why — the plugin's own suite: 366 of 407, three times over

`node --test "scripts/__tests__/*.test.js"` — the exact host-gate command — ran on all three
CI attempts. The count never moved: `tests 407, pass 366, fail 40`, every time. Every failure
lives inside a test file; none of them is in the code the round trip above exercised for real
(`hooks/`, `skills/*/scripts/`, excluding their own test suites). Four recurring patterns,
verified against the actual failing assertions rather than assumed, account for the great
majority of the 40:

1. **A test helper's own git-call counter never intercepts anything on Windows.**
   `aidd-telemetry-journal.test.js`'s `countGitInvocations()` writes a `#!/bin/sh` shim named
   `git` (`chmod 0o755`, no extension) and prepends its directory with
   `` `${binDir}:${process.env.PATH}` `` — colon-joined, POSIX-only, and a shim Windows
   couldn't execute regardless (Windows resolves an executable by PATHEXT/extension, not a
   shebang or the POSIX execute bit — the identical gap this task already found and named as
   the reason `telemetry-multi-tool.e2e.test.ts` is excluded below). The wrapper is silently
   bypassed; real `git` runs untouched. Directly explains the three "shells out to git N
   times" tests and cascades into others sharing the helper.
2. **`getRepoRoot()`'s git-derived path and a test's own hand-built path are two valid,
   different strings for the identical directory.** `git rev-parse --show-toplevel` on Windows
   answers with a forward-slash, long-filename canonical path
   (`C:/Users/runneradmin/AppData/Local/Temp/...`); a path a test builds itself under `%TEMP%`
   on this runner comes out backslash-separated and, because `%TEMP%` itself resolves through
   the account's 8.3 short alias here, short-named (`C:\Users\RUNNER~1\...`). `assert.
   strictEqual` doesn't know these name the same place. The two worktree-resolution tests fail
   this way, verbatim — `'C:/Users/runneradmin/.../wt'` received where
   `'C:\Users\RUNNER~1\...\wt'` was expected. The shipped matching code this task could find
   (`file-writes.js`) already runs both sides through `normalizeSeparators` before comparing,
   so this reads as a test-assertion gap rather than a proven defect in what ships — but it is
   real, observed evidence that two different valid spellings of "the same path" coexist on
   Windows in a way nothing in this codebase had reason to handle before.
3. **`.gitignore` is checked out with CRLF line endings.** Git for Windows' default
   `core.autocrlf` rewrites the repository's LF-committed `.gitignore` on checkout. A test
   splitting it on `"\n"` with no `.trim()` then compares `'.aidd/*\r'` against the literal
   `'.aidd/*'` and fails on the trailing `\r` alone. The shipped code
   (`journal-privacy.js`'s own duplicate-entry check) already `.trim()`s before comparing, so
   this doesn't touch what ships — it's a real, observed Windows checkout fact worth recording
   on its own.
4. **A doc/code-parity test asserts a POSIX-literal path.** `telemetry-where-things-live.
   test.js` computes `sink.js`'s live default and compares it to the hardcoded literal
   `'/sentinel-home/.config/aidd/telemetry'`. On Windows the live value is `path.join`'s own
   correct, native-separator answer — the same fact "Where the figures land" establishes above,
   hitting a second, independent assertion that never accounted for a non-POSIX separator.

A fifth, narrower pattern turned up sampling beyond these four, in the repository's own
markdown-link checker (`check-markdown-links.test.js`, not the telemetry plugin): a fixture
link built with `path.relative` picks up Windows' native backslash separators, and the
checker's own link-matching doesn't recognize a backslash-separated relative link — so it is
misclassified as broken rather than as the cross-repo-relative case it actually is. Named here
because it was found, not because it belongs to #707's scope.

None of this was fixed. Every failure lives inside `scripts/__tests__/*.test.js` or
`check-markdown-links.js`'s own suite — files a second, independent agent was actively editing
throughout this task in this same worktree (see Bounds). Editing them now would race that work
directly; this task reports the patterns it found instead. Not one line of shipped plugin code
needed changing to make the real round trip above pass.

## Not #707's scope, but observed: the CLI's own suites are broadly red on Windows too

`pnpm test:unit`, `pnpm test:integration`, and `pnpm exec vitest run --project=e2e` (with
`tests/e2e/persona.e2e.test.ts` and `tests/e2e/telemetry-multi-tool.e2e.test.ts` excluded by
name — see next section) all ran, from `cli/`, on the same runner:

```
unit:        1965 tests — 1898 pass, 67 fail, across 28 of 175 test files
integration:  594 tests —  439 pass, 154 fail, 1 skipped, across 19 of 59 test files
e2e:          165 tests —  133 pass, 32 fail, across 14 of 22 remaining test files
```

Sampled failures confirm the same POSIX-literal-path pattern found in the plugin's own suite,
recurring at repo-wide scale: `telemetryConfigPath("/repo")` returns `\repo\.aidd\config.json`
on Windows — `path.join`'s own correct answer — against tests asserting the literal
`/repo/.aidd/config.json`, across dozens of the CLI's own telemetry unit tests
(`enable-tool-telemetry-use-case`, `telemetry-on-use-case`, `telemetry-off-use-case`,
`claude-telemetry`, and others). Some failures are unrelated to paths or to telemetry at all
(e.g. `update-ai-tools-use-case.unit.test.ts`'s mock-call-count assertion) — establishing a
second, wider fact this task did not go looking for: **the CLI's general test suite,
independent of telemetry, has never run on Windows either.** Issue #707's own bound applies
here unchanged: this does not claim the CLI is broken off macOS, it claims nobody knew.

Of the 14 failing e2e files, 7 are telemetry-specific (`telemetry-hook-install`,
`telemetry-lifecycle`, `telemetry-plugin-matches-cli`, `telemetry-plugin-standalone`,
`telemetry-report`, `telemetry-sink`, `telemetry`) and 5 are general-CLI, unrelated to
telemetry (`command-matrix-plugin`, `framework-build`, `issue-271-setup-cache-version`,
`plugin-create`, `plugin-install`). One telemetry e2e failure goes past a path-literal or
checkout artifact: `telemetry-hook-install.e2e.test.ts` asserts `aidd plugin install <source>
--yes` exits `0` and receives `1` — a real CLI command failing outright on Windows, not merely
a test's own POSIX assumption. This task did not root-cause it further; it is named as a real,
unresolved finding rather than folded into the path-literal pattern above without evidence.

**None of this was fixed, and it is out of #707's stated scope on purpose.** Root-causing and
repairing several hundred hardcoded POSIX-path-literal assertions across the CLI's own test
suite, plus at least one apparently real product-command failure, is not a surgical change
scoped to "the telemetry layer" — it is its own, considerably larger undertaking. Declared here
rather than attempted or quietly excluded: the CLI's Windows support, independent of telemetry,
is now partially measured (these three numbers), and what would need to change to make it pass
is not.

## The two e2e files excluded by name

- **`tests/e2e/persona.e2e.test.ts`** — hardcodes `/usr/bin/expect` (`EXEC_BIN` in the test's
  own source) for TTY emulation. That path, and the `expect` binary, do not exist on
  `windows-latest`.
- **`tests/e2e/telemetry-multi-tool.e2e.test.ts`** — writes a `#!/bin/sh` stand-in `opencode`
  binary to a temp `bin/` directory (`chmod 0o755`, no file extension) and puts it on `PATH`,
  so the test can answer `opencode export ... --sanitize` itself. Windows resolves an
  executable by PATHEXT/extension, not a shebang line or the POSIX execute bit — the file is
  never launched there, and this is the identical gap `countGitInvocations()` hits inside the
  plugin's own suite above, not a coincidence.

Both are real, load-bearing Windows gaps in the test suite's own tooling, not something this
task judged optional — they are excluded by name, with the reason on the record, per the task's
own instruction, rather than the whole e2e project being skipped.

## What changed

Two things, both to this task's own probe — nothing to the shipped plugin or CLI code:

1. The round trip's fixture `cwd` is rewritten to the runner's real checkout path
   (`process.cwd()`) before piping into `journal.js` — the raw fixture's own captured `cwd`
   exists on no CI runner, Windows included, the same fact the Linux measurements already
   documented and edited around.
2. The job's own step ordering: every diagnostic step carries `continue-on-error: true`, with
   a final step that fails the job iff any real step failed. Without this, the first attempt's
   plugin-suite failure silently skipped every step after it, including the three answers and
   the round trip this job exists to produce.

The three commits pushed to trigger CI — `b84b6d15`, `fe1b679b`, `5c025422` — each touch only
`.github/workflows/cli-ci.yml` (confirmed via `git show --stat` on each, one file apiece). No
line under `plugins/aidd-telemetry/` or `cli/src/` was authored by this task.

## What is now known, and what is still not

**Now known, by observation, on Windows (`windows-latest`, Windows Server 2025):**

- Where the figures land: `%USERPROFILE%\.config\aidd\telemetry` — not `%APPDATA%`, exactly as
  issue #707 predicted, confirmed both with the runner's own `HOME` and with `HOME` forced
  unset.
- What POSIX modes do: nothing errors, and nothing protects. `0o700`/`0o600` are accepted
  silently by `mkdirSync`, `appendFileSync`, and `chmodSync`, and the mode on disk is `0666`
  regardless — the journal's privacy on Windows rests entirely on inherited NTFS ACLs this code
  never touches, not on anything `repo.js`/`sink.js`/`record.js` asks for.
- The skill's `find`-based script search: resolves under Git Bash, identically to Linux and
  macOS; does not resolve at all under plain PowerShell, where Windows' own `find.exe` shadows
  GNU `find` and rejects the line's own flags outright.
- The full local chain — switch, hook, journal, reader, checker — works end to end on Windows
  for a real captured payload, once the payload's own `cwd` names a real directory.
- `git` on `PATH`, spawned exactly the way `getRepoRoot`/`warnIfTracked`/`telemetry-switch.js`
  spawn it, works on Windows without any special handling — every real git call this task made
  succeeded.
- The plugin's own suite: 366 of 407 pass, reproducibly, across three separate CI runs. The 40
  failures trace to four-to-five recurring test-authoring patterns (a POSIX-only test-helper
  shim, git-path string-form divergence, CRLF-checkout literals, hardcoded POSIX-path-literal
  assertions) — none of them a defect this task could find in `hooks/` or `skills/*/scripts/`
  themselves, all left unfixed because the file most responsible for them was under live,
  concurrent, unrelated edit throughout this task.
- Beyond #707's stated scope, but observed and reported rather than hidden: the CLI's own
  unit/integration/e2e suites are extensively red on Windows too (67, 154, and 32 failures
  respectively), mostly the same path-literal pattern at far greater scale, plus at least one
  apparently real product-command failure (`aidd plugin install --yes` exiting `1`) this task
  did not root-cause further.

**Still unknown:** the CLI's general Windows support beyond the three numbers above; whether
the `aidd plugin install` failure is specific to Windows broadly or to this one e2e scenario;
anything about a real, authenticated AI-tool session on Windows — the same tool-boundary limit
the Linux file names, unmeasured here for the identical reason; and what the CLI's own
POSIX-path-literal test assertions would need to become correct on Windows, a separate, scoped
piece of work this task did not attempt.

## Restoration

The scratch branch, `ci/windows-probe`, is deleted — both locally (`git branch -D`) and on
`origin` (`git push origin --delete ci/windows-probe`), confirmed by `git ls-remote --heads
origin` showing nothing named `windows-probe` afterward. Every commit on it lived only long
enough to trigger a run; none touched `claude/aidd-telemetry-layer-e403uf` directly (it was
branched from it, pushed to its own ref, never merged back by commit) and none touched pull
request #706. The workflow-job diff this file's findings came from is the sole uncommitted
change on `claude/aidd-telemetry-layer-e403uf`'s working tree — `git diff --stat` shows exactly
`.github/workflows/cli-ci.yml`, 160 lines added, nothing removed — left there for review rather
than committed by this task.
