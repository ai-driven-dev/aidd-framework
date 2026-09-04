# Measurements

## Phase 1 — the confrontation with data the code has never seen

The committed fixture is synthetic, so it agrees with the code that reads it. This is the
step that does not: the deleted script and the CLI, run over the machine's own sink, whose
records nobody authored for this test.

Run 2026-08-26, on a sink holding 34 records across five tools, three days, four steps and
both record kinds. The script was restored from git into a temporary directory for the
comparison, and removed after it.

```
report --json          identical
report --axis total    identical
report --axis day      identical
report --axis model    identical
report --axis project  identical
report --axis step     identical
report --axis tool     identical
```

Every rendering the two share is byte-identical on real data. Nothing was recorded to fix.

## What the fixture cannot show, and why

Two fields are absent from the committed envelope by construction, and are declared
conditional rather than asserted:

- `cost_micro_usd` — present only once a record states an amount. No tool read locally
  writes one, which is why every figure reads `amount unknown`.
- `task`, `task_attribution`, `filters`, `empty_selection`, `active_time_s` — present only
  under a selection.

Their presence and shape are pinned by the CLI's own envelope tests. What
`scripts/__tests__/aidd-telemetry-cost-skill.test.js` pins is narrower and still worth
having: the skill names no envelope field that exists nowhere at all.

## A coverage gap this phase opened, and where it is closed

`--axis` did not exist on the CLI. The skill's markdown named it, the CLI refused it, and it
was caught before anything was deleted — by the check that every command the skill names is
one the CLI accepts. It is now `cost-report-artefact.ts`, byte-identical to the script's own
rendering on all six axes, on both the synthetic fixture and the real sink above.

Two suites moved out of `scripts/__tests__/aidd-telemetry-identity.test.js` and into phase 2:
*"what a default install actually stores, proven from the stored bytes"* and *"a choice made
today does not reach backwards"*. Both drove `read` through the deleted reporter. Until phase
2 restores them against `aidd telemetry read`, the behaviour is pinned one level down, in
`read-local-cost-use-case.unit.test.ts`. That is real coverage, and it is not the same as
reading the bytes.

## Phase 2 — `aidd telemetry identity` confronted with the script it replaces

Both suites named above are now restored as e2e tests against `aidd telemetry read` itself
(`cli/tests/e2e/telemetry-identity.e2e.test.ts`), reading the stored JSONL lines from disk
rather than a stubbed sink — the same claim the deleted reporter's tests made, made again
against the CLI.

`telemetry-identity.cjs` and `aidd telemetry identity` were then run side by side over the
same starting profile, once per verb, and the resulting `identity.json` compared byte for
byte (`identityFileIn` gives both sides the same path convention: `.config/aidd/identity.json`
on POSIX, `AppData/Roaming/aidd/identity.json` on Windows). Run 2026-08-26.

```
name  (same pre-written identity on both sides)         byte-identical
on    (against an existing identity, both untouched)     byte-identical
on    (from empty — each side mints its own uuid)         identical shape once each side's own v4 id is normalized to a placeholder;
                                                            both ids independently verified against the v4 pattern
off   (both remove the file)                              file absent on both sides
status (no write, whatever the starting state)             file unchanged on both sides; both print the same person_id
```

`on` from an empty profile cannot be raw-byte-identical by construction — both sides call
their own random UUID generator, so the two files necessarily hold two different
identifiers. The comparison that carries the real risk is `name`: it is the one write whose
shape (key order `person_id` before `display_name`, two-space indent, one trailing newline)
could silently drift into camelCase or a different field order without any test noticing
before this one. It came back byte-identical on the first run — nothing was recorded to fix.

Mode bits were checked once, on the freshly-minted file from the empty-profile `on` run,
skipped on `win32` where `mode` is a documented no-op: `identity.json` is `0600`, its
directory `0700`.

## What this phase deliberately does not match

The script's `readIdentity()` folds a read failure (a directory sitting where the file
should be, a permission error, damaged JSON) into the same `null` as a plain missing file —
"nobody chose" reads the same whichever of the three caused it. `aidd telemetry identity`
does not: `readStrict()` throws on anything past `ENOENT`, so `status`, `on` and `name` all
surface a read failure as an error rather than as "no identity is set" — the Test Scope's own
"the identity file is unreadable" edge case, and the fourth line of task 4's acceptance
criteria. `read()`, the method `aidd telemetry read`'s local-cost sweep depends on, keeps the
script's original swallow-everything behaviour unchanged: one damaged identity file must
never cost every tool's figures for an entire sweep.

`off` is the one exception to "surface a read failure as an error": it catches its own
`readStrict()`'s throw and discards the damaged file anyway, stating that it did — a real
probe (`{ not json` written over `identity.json`, then `status`, then `off`) confirmed
`status`/`on` correctly error and leave the file in place, and that `off` now removes it
and says why, where an earlier version of this phase left a damaged file with no way out
of the CLI. `status`, `on` and `name` are unchanged: erroring there is still correct, and
still the contract's own edge case.

The script's `name` also accepts a whitespace-only value: `!value` is `false` for `"  "`, so
it writes `display_name: "  "`, keeps it, and echoes it straight back — a probe against the
real script (`telemetry-identity.cjs name "  "` then `status`, read with `cat`, not a filter
that can eat the thing under test) prints `display name "  "` verbatim. There is no drop
anywhere in the script's own path; an earlier draft of this note claimed `readIdentity()`
silently discards it on the next read, which is false — that check only fires on a literal
empty string (`display_name !== ""`), never on whitespace.

The CLI refuses a whitespace-only value anyway (`EmptyDisplayNameError`), on an independent
ground the script does not share: this layer's own rule that an identity is never a default,
and a name nobody chose to type is not a name. This is a deliberate parity deviation, not a
behaviour the script already has and the CLI merely preserves — recorded here plainly so
phase 3 does not read it as behaviour-preserving. Any non-blank value, including one with
leading or trailing whitespace, is stored exactly as given, untrimmed — that is what keeps
the `name` parity test above byte-identical to the script for every value that is not this
one refused case.

## A deviation from the architecture projection, and why

`phase-2.md`'s tree lists no new port file, and this phase added one:
`domain/ports/person-identity-store.ts`. `0-layer-responsibilities.md` requires an adapter to
implement exactly one port, and the four new verbs need write methods the existing
`PersonIdentityReader.read()` never had — `read()` also has a documented "never throws"
promise that `read-local-cost-use-case.ts` depends on, which the identity verbs' `readStrict()`
deliberately breaks (see above), so the two could not live on one interface without either
weakening that promise or overloading one method name with two contracts. `PersonIdentityStore
extends PersonIdentityReader`, the same shape already used by `CliAuthProvider extends
TokenResolver` (`domain/ports/oauth-provider.ts`), so `PersonIdentityAdapter` still implements
exactly one port — `PersonIdentityStore` — while `ReadLocalCostUseCase` keeps depending on the
narrower `PersonIdentityReader` it always has.

## Phase 3 — `00-init` calls the CLI, confronted with a live absent-CLI run

Tasks 0 (separating the switch from the endpoint) landed in the working tree ahead of this
phase and is not redone here; this phase is tasks 1–4 only — rewriting `00-init`'s own
markdown, confirming what the switch script did beyond flipping a flag still happens,
deleting the scripts and their suite, and proving every command the skill now names is one
the CLI accepts.

### The confrontation: `aidd` present, then removed from `PATH`, for real

`01-check.md` now runs `aidd --version` and reuses `01-cost/actions/01-locate.md`'s own
absent-CLI paragraph verbatim (pinned by a containment test in
`telemetry-init-skill-commands.e2e.test.ts`, not just eyeballed). Run for real rather than
only through a test double:

```
$ aidd --version
aidd/5.1.3 node/25.8.0 darwin-arm64          # exit 0 — the check continues to enable/verify

$ env -i PATH="/usr/bin:/bin" aidd --version
env: aidd: No such file or directory        # exit 127 — "a command that is not found"
```

The documented rule ("No output, or a command that is not found, means this machine cannot
answer") matches both outcomes on a real shell, not a mocked one — the same two-line proof
phase 1 already ran for `01-cost`, now re-run for `00-init` since the wording, not just the
behaviour, has to agree with it.

### Task 1 — every `.cjs` path is gone from `00-init`'s own markdown

`SKILL.md`, `01-check.md`, `02-enable.md`, `04-identify.md` and `05-forget.md` no longer name
a script. `01-check.md`'s absent-CLI rule is byte-identical to `01-cost/actions/01-locate.md`'s
from "No output, or a command that is not found" through "cost nothing." — verified once by
`diff` while writing it, and pinned going forward by
`telemetry-init-skill-commands.e2e.test.ts`'s own containment test, so a future edit to
either file that drifts the wording fails the suite rather than waiting for a reviewer to
notice.

### Task 2 — what the switch script did beyond flipping a flag, confirmed present and completed

`aidd telemetry on` already git-ignored `aidd_docs/runs/` and warned on an already-tracked
journal before this phase started — task 0's `protectRunsDir` — so nothing needed adding
there; `cli/tests/e2e/telemetry-on-runs-privacy.e2e.test.ts` (also landed with task 0) already
pinned five of the six claims `aidd-telemetry-switch-gitignore.test.js` pinned against the
script. The one claim neither owned — `git add -A` actually succeeds against what `on`
writes, and the journal stays out of the index — is now the sixth test in that same file.

What each half is proven by, since no single file owns all of criterion 2:

| Claim | Where |
| --- | --- |
| `.gitignore` gets exactly `aidd_docs/runs/`, deduped, and a tracked journal is named once | `telemetry-on-runs-privacy.e2e.test.ts` |
| `git add -A` succeeds and stages nothing under `aidd_docs/runs/` | `telemetry-on-runs-privacy.e2e.test.ts` (new) |
| The run directory and journal file are `0700`/`0600` | `scripts/__tests__/aidd-telemetry-journal.test.js:959-962` — the hook's own write path, which `aidd telemetry on` never touches (it writes `.gitignore` and the switch file only) |

### Task 3 — the scripts, their suite, and what deleting them broke elsewhere

`plugins/aidd-telemetry/skills/00-init/scripts/` (2 files, `telemetry-switch.cjs` and
`telemetry-identity.cjs`, plus `lib/journal-privacy.cjs` and `lib/identity.cjs` — the phase's
own "4 files, 278 lines") is deleted; its `package.json` marker was already gone, removed in
`ec15a80f` when the plugin moved to a per-file module-system declaration, well before this
phase.

`scripts/__tests__/aidd-telemetry-identity.test.js` (14 tests) is deleted, as named. One
suite the phase's own architecture projection did not name is deleted alongside it:
`scripts/__tests__/aidd-telemetry-switch-gitignore.test.js` (6 tests). Its subject,
`telemetry-switch.cjs`, is exactly the file task 3.1 removes, and every one of its six
claims is already re-proven against the CLI in `telemetry-on-runs-privacy.e2e.test.ts` (see
the table above) — keeping it would mean spawning a file that no longer exists. Declared here
rather than left to surface as a failure: `node --test scripts/__tests__/*.test.js` drops by
20 from this pair alone (14 + 6), not the 14 the phase's own acceptance table anticipated.

A further 10 tests drop from `plugin-install-shape.test.js` without any file being deleted:
it discovers every `*.cjs` script under `skills/*/scripts/` and generates one
"starts and prints its own output" test per script per install shape (5 shapes). Two scripts
disappearing means 2 × 5 = 10 fewer generated tests; `KNOWN_INVOCATIONS` no longer names
either. Total drop across the plugin suite: 20 + 10 = 30 (365 → 335), all accounted for.

Two more suites named a `00-init` script and needed updating, not deleting, once it was
scripted no longer:

- `aidd-telemetry-cost-skill.test.js` asserted `01-check.md` searches for
  `telemetry-switch.cjs` on a tool with no plugin-root variable, and — in the same file —
  that `00-init` must **not** depend on `aidd telemetry` (line-for-line the opposite of what
  this phase does). Both assertions are inverted to match: the `searched` table drops the
  00-init row (it ships no script to find any more, same as 01-cost already read), and the
  "owns turning measurement on" test now requires `aidd telemetry on` and forbids any
  `.cjs` mention instead.
- `plugin-install-shape.test.js`'s `KNOWN_INVOCATIONS` drops `telemetry-switch.cjs` and
  `telemetry-identity.cjs` (see above).

Deleting the script also broke three files this phase's own architecture projection never
named, because they drove the plugin's write path standalone through the same script the
CLI now owns the switch through:

- `cli/tests/domain/models/plugin-asset-translation.unit.test.ts` asserted
  `skills/00-init/scripts/telemetry-switch.cjs` survives a tool's rewrite byte for byte —
  one entry removed from its `ARTEFACTS` list; the same claim is still proven for every
  hook script, which is the one this test exists to guard.
- `cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts` spawned the script directly to
  prove the plugin works with `aidd` off `PATH`. Its three switch-behaviour tests
  ("turns measurement on", "keeps whatever else the config held", "turns it back off") are
  removed — `cli/tests/e2e/telemetry.e2e.test.ts` and `telemetry-on-runs-privacy.e2e.test.ts`
  already prove the same claims against the CLI, which now owns the switch and is what a
  reader would look for first. What survives, unweakened: the journaling test, whose entire
  point is that recording needs no `aidd` anywhere — it now seeds `.aidd/config.json`
  directly instead of calling the script, so the one thing left running with no CLI on
  `PATH` is exactly the write path this file exists to prove standalone. The trailing
  "keeps the switch short enough to read" check on the script's own line count is removed;
  there is no script left to be short.
- `cli/tests/e2e/telemetry-lifecycle.e2e.test.ts` — the full nothing-to-off-and-back
  sequence — called the script for every `switchTo("on"|"off")` inside an environment that
  deliberately strips `aidd` from `PATH`. `switchTo` now calls the built CLI by its own
  path instead (`run(CLI_PATH, ["telemetry", state])`), the same mechanism `measure` already
  used for `report`/`read` — so `PATH` being stripped of `aidd` no longer changes what this
  file proves about the switch, only about the hooks, which was always the point of
  stripping it. All three of this file's tests still pass unchanged otherwise.

### Task 4 — every named command, proven against the CLI, in a safe order

`00-init`'s own commands are stateful — `identity name` and `identity off` only make sense
once `identity on` has run — unlike `01-cost`'s, which are independent reads. Running the
extracted `Set` in whatever order the markdown walk happens to visit files risks `identity
name` executing before `identity on` ever did. `telemetry-init-skill-commands.e2e.test.ts`
sorts every `on` command first and every `off` command last before running any of them, so
the six named commands (`on`, `off`, `identity status`, `identity on`, `identity name
"<value>"`, `identity off`) always run in an order where every precondition is already met,
regardless of file walk order.

### The parity suite `telemetry-identity.cjs`'s deletion leaves behind

Phase 2 pinned the CLI against `telemetry-identity.cjs` with six tests
("confronted with the script phase 3 deletes"). Deleting the script this phase kills that
comparison; each of the six is accounted for rather than dropped silently:

| Former parity test | What happens to it |
| --- | --- |
| `name`: byte-identical from the same starting identity | **Kept**, as a fixture pin — the exact bytes the script wrote, captured 2026-08-26 before deletion, asserted directly rather than compared live |
| `on`, from empty: same on-disk shape and modes | **Kept**, as a fixture pin — the normalized shape (`{ "person_id": "<uuid>" }`) plus the `0600`/`0700` modes, both captured the same way |
| `on`, against an existing identity: file untouched | **Left with the script.** The CLI's own claim — a second `on` reports the same identifier and does not rewrite the file — is already proven by the journey block's "a second `on` reports the same identifier, never a new one" |
| `off`: both remove the file | **Left with the script.** The journey block's own walk (`status -> on -> name -> status -> off`) already asserts the file is gone after `off` |
| `status`: no write, against an existing identity | **Left with the script.** The journey walk reads `status` against a minted identity and asserts the identifier appears; nothing rewrites the file on a read, and no test anywhere claims otherwise |
| `status`: no write, against an empty profile | **Left with the script.** The journey walk's first step is exactly this: `status` against nothing, asserting `off` |

The two kept as fixture pins are the one claim nothing else in the suite owns: the literal
on-disk byte format a person's `identity.json` would have taken under the deleted script.
The four left behind were never distinct claims about the *CLI* — they were the same claim
the journey block already made, run a second time against a script that is now gone. Keeping
all six as live fixtures would have been the duplication `plan.md`'s own Decision names
("one equivalence pin, not a suite watching two implementations agree with themselves").

### Net test counts, tasks 1–4

| Suite | Before | After | Why |
| --- | --- | --- | --- |
| `scripts/__tests__/*.test.js` | 365 | 335 | −14 (identity suite deleted) −6 (switch-gitignore suite deleted) −10 (install-shape's dynamic script discovery, 2 scripts × 5 shapes) |
| `cli` unit | 2069 | 2068 | −1 (`plugin-asset-translation.unit.test.ts`'s `ARTEFACTS` entry for the deleted script) |
| `cli` integration | 608 | 608 | unchanged |
| `cli` e2e | 200 | 196 | +3 (`telemetry-init-skill-commands.e2e.test.ts`, new) +1 (`telemetry-on-runs-privacy.e2e.test.ts`'s `git add -A` test, new) −4 (`telemetry-identity.e2e.test.ts`'s six parity tests collapsed to two fixture pins) −4 (`telemetry-plugin-standalone.e2e.test.ts`'s three switch tests and the script-line-count test removed) |

## Phase 4 — `aidd telemetry check`, the local claims

### The port's shape: reuse over re-implementation

`diagnose.cjs`'s six claims split cleanly into two routes. This phase settles the local
route (`hook fired` -> `session journalled` -> `tool files readable` -> `records join`) and
states the export route's two claims (`export configured`, `identifier joinable`) as
`unjudged` — a fourth verdict, distinct from `unknown`: an `unknown` was checked and came
back inconclusive, an `unjudged` is a fact this build does not attempt to check at all.

Most of `readers.cjs` (540 lines) and `attribution.cjs` needed no port at all. `aidd
telemetry read` already reads every covered tool's own files through the exact same
`SessionCostReader` map, and `domain/models/step-attribution.ts`'s `buildStepIntervals`/
`attributeMoment` already compute the same join `attribution.cjs` does — both built in
phase 1 and unchanged here. `domain/ports/run-journal-reader.ts`'s `list()` already returns
what `journal.cjs`'s `listJournals` returns. `DiagnoseTelemetryUseCase` depends on all three
directly rather than wrapping them in a second "evidence" adapter, which is why
`telemetry-evidence-adapter.ts` ended up covering only what neither of those already
promised: the switch, the unrecognised-payload marker, and Codex's own hook-trust state.
`isRepository` landed on `VersionControl`/`GitAdapter` instead, beside `listTrackedFiles`
phase 3 already added there, rather than a second git-shelling implementation.

### A deviation from task 2's own list, and why

Task 2 names four things for the evidence adapter to port: "switch, repository, journal and
marker." Codex's hook-trust state is not in that list, and it is ported here anyway —
`hook fired`'s own FAIL can mean "never observed firing" or "Codex has not trusted this
plugin's hook," two claims task 1 itself requires to stay distinguishable ("no two distinct
reasons share one verdict"). Reading `~/.codex/config.toml` was the only way to keep that
promise for the one claim it is exercised by all through, so it is included in
`telemetry-evidence-adapter.ts` alongside the four the task names — read as an
under-specification in the task list, not a deliberate exclusion, and confirmed against
`telemetry-check.test.js`'s own "naming whether the hook fired" suite, which exercises it
as core `hook-fired` coverage, not export-route coverage.

### Confronted with the script

Three parity tests in `cli/tests/e2e/telemetry-check.e2e.test.ts` run `telemetry-check.cjs`
and `aidd telemetry check` over the same starting state and diff their first four printed
lines verbatim: a healthy fixture (switch on, a journalled Claude Code session, the real
transcript fixture beside it), the hook never having fired at all, and the two gates
(switch off; outside a git repository). All three came back byte-identical on the first
run — nothing was recorded to fix. `render.cjs`'s own column widths (`LABEL_WIDTH = 22`,
verdict padded to 4) are reproduced exactly in `telemetry-check-display.ts` for this reason:
the parity claim is a printed line, not just a verdict.

### Net test counts

```
cli unit          2100 passed  (was 2068; +25 telemetry-claim.unit.test.ts, +7 diagnose-telemetry-use-case.unit.test.ts)
cli integration     608 passed  (unchanged)
cli e2e             210 passed  (was 201; +9 telemetry-check.e2e.test.ts)
plugin suite        337 passed  (unchanged — no plugin file touched this phase)
tsc, biome, check-cli-layering, check-markdown-links   clean
```

## Phase 5 — `aidd telemetry check`, the export, the trust, and the join

### The port's shape

`export-config.cjs`, `export-sink.cjs` and `hook-trust.cjs` each became one adapter behind
one new port (`export-config-reader.ts`, `export-sink-reader.ts`, `hook-trust-reader.ts`).
`telemetry-evidence-adapter.ts` lost `readCodexHookTrust` to its own port rather than
growing a fourth responsibility — `hook-fired`'s two FAIL reasons (never observed, untrusted
hook) are read from two different files (the run journal, Codex's `config.toml`) and belong
behind two different ports on that basis alone. `diagnoseLocalTelemetryClaims` became
`diagnoseTelemetryClaims`: the `unjudged` verdict phase 4 introduced for the two export
claims is gone entirely now that both are judged, leaving the three-verdict set
(`ok`/`fail`/`unknown`) task 1 of phase 4 originally specified.

### Confronted with a machine's real configuration (task 4)

Run against this development machine's own, never-authored-for-this-test configuration:
a real `~/.codex/config.toml` carrying a genuine `[hooks.state...]` table with a real
`trusted_hash` entry for this plugin, and a real `~/.claude/settings.json` (~22KB, this
machine's actual accumulated settings). Anchored once as a Codex session
(`CODEX_THREAD_ID` set) and once as a Claude Code session (`CLAUDE_CODE_SESSION_ID` set),
`telemetry-check.cjs` and `aidd telemetry check` were run side by side over both anchors.

**The side-by-side run against these real files caught one divergence.** The ported
`export-config-reader-adapter.ts` rendered its detail strings with an em dash (`—`) in
three places — `codexMissingDetail`'s two messages and `readClaudeExportConfig`'s "not
together in one file" message — where `export-config.cjs` writes a plain hyphen (` - `).
A synthetic fixture would have agreed with either punctuation, since both sides would have
been written to match the same test; only comparing against this machine's real files,
whose exact bytes no test fixture chose, made the mismatch visible. **Settled as a defect
in the CLI port**, fixed to match the script's punctuation exactly (see
`export-config-reader-adapter.ts`'s `codexMissingDetail` and `readClaudeExportConfig`).
The re-run after that fix came back **byte-identical on all six claim lines, on both
anchors** — nothing left unsettled. This confrontation is now unreproducible by design —
`telemetry-check.cjs` is deleted as of this same phase's task 5 — which is why it is
recorded here rather than left as a test CI could ever rerun again.

### Task 5's collateral: three tests that named the deleted script

Deleting `02-check/scripts/telemetry-check.cjs` (13 files, 1,664 lines) broke three tests
that were not on the plan's own file list, none of which the plan's acceptance criteria
mention, all fixed as part of leaving no debt from the deletion itself:

- **`cli/tests/domain/models/plugin-asset-translation.unit.test.ts`**'s "installing the
  plugin carries its measurement script" describe block read `telemetry-check.cjs` off
  disk to prove the translator carries a skill-nested script byte for byte. Since no skill
  in this plugin ships a script any more (00-init, 01-cost, and now 02-check all moved to
  `aidd`), it now borrows real bytes from `hooks/journal.cjs` — a file this plan does not
  delete — placed at a synthetic skill-nested path (`skills/02-check/scripts/example.cjs`).
  The path is the fixture; the content is still real, which is what tells "carried
  verbatim" apart from "compared a string to itself."
- **`scripts/__tests__/plugin-install-shape.test.js`**'s `KNOWN_INVOCATIONS` map held only
  `telemetry-check.cjs`; emptying it would have left "discovers the scripts known today"
  iterating zero keys and passing vacuously — silently indistinguishable from the walk
  never running at all. Inverted to a direct assertion, once per install shape: `ships no
  skill scripts, now that every skill calls the CLI instead`, which fails loudly
  (confirmed red before the deletion, green after) rather than passing by omission.
- **`scripts/__tests__/aidd-telemetry-cost-skill.test.js`** carried two tests keyed to the
  soon-to-be-deleted script: `"each skill finds its own script..."` searched
  `02-check/actions/01-locate.md` for a `find` command across plugin directories — gone now
  that locate just runs `aidd --version` — replaced with a positive assertion that no
  skill's actions search for a script that way any more. `"the check skill calls the
  plugin's own binary, never the CLI"` asserted the opposite of what phase 5 does on
  purpose; inverted to `"the check skill calls the CLI, never a script of its own"`.

### A gap the plan's own acceptance criteria did not name

`telemetry-check.e2e.test.ts` pins `aidd telemetry check`'s *behaviour* against fixed
fixtures; it never reads `02-check`'s own markdown, so it could not have caught the
markdown naming a command the CLI does not accept — exactly the class of defect
`telemetry-where-things-live.test.js`'s own header describes (a README naming a deleted
script for two phases, undetected by both existing guards). `00-init` and `01-cost` are
each held to this by their own `telemetry-*-skill-commands.e2e.test.ts`; `02-check` had no
equivalent. Added `cli/tests/e2e/telemetry-check-skill-commands.e2e.test.ts`, mirroring the
same shape: every `` `aidd telemetry …` `` command `02-check`'s markdown names is extracted
and actually run through the CLI, and the skill is pinned to name no `.cjs` path any more.

`commandsNamedBySkill`'s regex only matches `` `aidd telemetry …` `` — `aidd --version`,
which `01-locate.md` now depends on, is not covered by this guard. Same limitation as the
two sibling files it mirrors, so this is consistent with existing coverage, not a new gap;
worth stating so the guard is not read as broader than it is.

### Net test counts

```
cli unit          2107 passed  (was 2100 at phase 4's close; −1 verified —
                                 registry-conformance.unit.test.ts's cross-check against
                                 readers.cjs, deleted with its `require`-based helper
                                 telemetry-cost-readers.ts once the file it required is gone;
                                 the remaining +8 is telemetry-claim.unit.test.ts (31 tests,
                                 up from phase 4) and diagnose-telemetry-use-case.unit.test.ts
                                 (9 tests) growing earlier in this phase to cover the export
                                 route, not from task 5's own collateral fixes —
                                 plugin-asset-translation.unit.test.ts: 20 tests today; the
                                 repoint changed fixture content, not test count)
cli integration     608 passed  (unchanged)
cli e2e             214 passed  (was 210 at phase 4's close, documented; grew earlier in
                                 phase 5 to 217 per the prior session's own account, not a
                                 count this session measured directly; task 5 itself,
                                 measured: −5 telemetry-check.e2e.test.ts's script-parity
                                 describe block, its comparison subject deleted; +2 new
                                 telemetry-check-skill-commands.e2e.test.ts)
plugin suite        233 passed  (was 337; −104 scripts/__tests__/telemetry-check.test.js,
                                 the checker it exercised deleted whole)
tsc, biome, check-cli-layering, check-markdown-links   clean
node cli/dist/cli.js telemetry check   run once post-build: exits 0, prints the expected
                                        "measurement is off" gate line — the exact step
                                        cli-ci.yml's Windows job now runs
```

## Phase 6 — the promise, and the absent CLI

### Task 1: one wording, pinned

The three locating actions' absent-CLI wording (`00-init/actions/01-check.md`,
`01-cost/actions/01-locate.md`, `02-check/actions/01-locate.md`) was two hyphens and one
em dash before this task: phase 5's rewrite of `02-check/actions/01-locate.md` used `—`
in "**recording is unaffected** — the hooks..." where the other two use ` - `. Fixed to
match. `scripts/__tests__/telemetry-cli-required.test.js` (new, 4 tests) pins the block
character for character across all three, confirmed red before the fix and green after by
temporarily reintroducing the em dash and re-running.

### Task 2: the promise, corrected

- `plugins/aidd-telemetry/README.md` already carried the three-act table from earlier work
  in this plan, but one sentence still lied: "`02-check` still runs a script this plugin
  ships, and needs nothing installed" — true before phase 5, false after it deleted
  `02-check/scripts/`. Corrected to "All three reach the CLI...".
- `docs/FAQ.md` claimed "No account, no server, no second tool to install" — false since
  phase 1: turning measurement on and reading it back both need `aidd`. Corrected to name
  the CLI as required for those two acts, recording excepted.
- `docs/CATALOG.md`'s `aidd-telemetry` entry named no dependency at all; added the same
  one-line split.
- Searched the whole repository (every `.md` file mentioning "telemetry", plus a grep for
  "no CLI" / "without...CLI" / "nothing installed" / "no second tool") for any remaining
  false promise. One more found, worse than a stale name:
  `aidd_docs/product/cost-report-contract.md`'s "Filters" section didn't just say "the
  plugin script" for a script gone since phase 1 — it asserted `aidd telemetry report`
  **refuses `--axis`** outright
  (`error: unknown option '--axis'`), which stopped being true the same phase, when
  `--axis` was ported onto the CLI directly (`cli/src/application/commands/telemetry.ts`).
  Verified live against the built CLI before rewriting: `aidd telemetry report --axis
  bogus` exits `1` with `Error: Unknown axis 'bogus'. Expected one of: total, day, step,
  model, tool, project.`, and `--axis total --json` together print the JSON object — `--json`
  wins, `--axis` is silently ignored, never the reverse. The paragraph now states both.

### Task 3: recording survives the CLI's absence — proven end to end

Phase 6's architecture projection lists no new or modified file under `cli/tests/e2e/` for
this task. On inspection, one existing test proved 3.1 outright, and nothing proved 3.2 in
the journey's own terms — `telemetry-lifecycle.e2e.test.ts`'s "lives the whole sequence..."
journals and reads with `aidd` stripped from `PATH` throughout, but every call there
invokes `dist/cli.js` by its built path, including the switch (`switchTo("on")`); the CLI
was present and doing the switching the entire time, never absent. Closed by extending
`telemetry-plugin-standalone.e2e.test.ts`'s existing describe block with a second test,
"reads a session's figures complete, though the CLI did not exist when it ran":

- Journals a whole session (`session_start`, a skill, a file write into a task folder,
  `turn_end`) exactly as the first test in that file does, with `aidd` nowhere on `PATH`
  and no CLI invoked at any point during the write.
- Only then calls `runCli` — the first and only invocation of `dist/cli.js` in the test,
  after every write has already happened — to `read`, then `report --json`, `report`, and
  `report --task <the task just written into>`.
- The load-bearing assertion is the `--task` one, not the token totals: task identity
  exists only in the journal's own `file_written` line, which the transcript fixture has
  no notion of at all. `--task` narrowing to the session's real figures rather than
  "nothing in this selection" is possible only because `read` consulted that line.
  `ReadLocalCostOptions`'s own doc comment independently confirms the mechanism: absent a
  session id, `read` "reads every session the run journal knows about" — the file just
  written with no CLI present — so even the plain `requests > 0` assertion already implies
  the journal was consulted, since nothing else tells `read` a session exists at all.
  Confirmed empirically too: re-running the same fixture with the journal step skipped
  entirely (transcript present, no run file) returns `requests: 0` / "nothing in this
  period" even for the plain, unfiltered report — `read` never opens the transcript at
  all, because the journal is the only thing that tells it a session exists to read.

Full re-run: `pnpm exec vitest run --project=e2e
tests/e2e/telemetry-plugin-standalone.e2e.test.ts tests/e2e/telemetry-lifecycle.e2e.test.ts`
→ 5 passed (was 4; the new test alone — this was already the full pair of files, not
just one).

### Task 4: Windows resolves `aidd` on its own PATH, not just by path

Every existing suite on the Windows job — including the "Chain - diagnose" step this
phase's predecessor added — invoked `node cli/dist/cli.js ...` directly, which proves
nothing about whether `aidd` resolves as a command on that platform's `PATH`. The Windows
job's "Chain - diagnose" step became two steps: build, `pnpm pack`, and
`npm install -g` the tarball (the same shim generation a real
`npm install -g @ai-driven-dev/cli` produces), then `aidd --version` followed by
`aidd telemetry check` — both lifted verbatim from what every skill's own locate action
names, run through the globally-resolved command rather than a path. A missing shim fails
`aidd --version` with "command not found" (exit 127), which fails the step and the job.

`cli/package.json` already carries an `install:local` script doing the equivalent (build,
`pnpm pack`, `npm install -g <tarball> --force`) for a developer's own machine, and the
CI step was written to call it at first. Not used: `install:local`'s tarball path is
resolved with `$(node -p "require('./package.json').version")`, bash command
substitution, but a package.json script runs through pnpm's own configured shell — `cmd.exe`
on Windows unless `script-shell` says otherwise, which this repository never sets. Under
`cmd.exe` that substitution is a literal string, not a version lookup, and the install would
fail in a way no macOS test could surface. The two commands are inlined into the workflow's
own `run:` block instead, which the job's `defaults.run.shell: bash` guarantees is bash
regardless, with a glob (`ai-driven-dev-cli-*.tgz`) standing in for the version lookup.

Verified on this machine (macOS, not Windows — the platform-specific `.cmd`/PATHEXT
resolution this task exists for can only be confirmed by an actual Windows CI run, which
this session cannot trigger): `npm pack` on the built CLI produces
`ai-driven-dev-cli-5.2.1.tgz` (matching the workflow's own glob), and
`npm install -g --prefix <sandbox> ./dist/ai-driven-dev-cli-*.tgz --force` followed by
`aidd --version` / `aidd telemetry check` resolved and ran correctly (exit 0 both times),
against a throwaway prefix — never this machine's real global `aidd`. `pnpm pack` itself
(the same call the workflow's own inlined step makes) could not be exercised locally: it
runs the package's `prepare: lefthook install` script regardless of who calls it, and this
checkout is a git worktree whose `core.hooksPath` lefthook refuses by design — a local
environment quirk this specific machine hits, not something a fresh CI checkout would; a
plain, non-worktree checkout carries no such override. Substituted
`npm pack --ignore-scripts` locally to verify the pack-and-install mechanics regardless of
that one blocked step.

### Net test counts

```
cli unit          2107 passed  (unchanged from phase 5's close — no cli/src file changed)
cli integration     608 passed  (unchanged)
cli e2e             215 passed  (was 214 at phase 5's close; +1
                                 telemetry-plugin-standalone.e2e.test.ts's new test, closing
                                 the task 3.2 gap this phase's first pass had only flagged)
plugin suite         237 passed  (was 233; +4 telemetry-cli-required.test.js, new)
tsc, biome, check-cli-layering, check-markdown-links   clean
```

Both follow-ups this phase's first pass flagged and deferred are closed, not carried
forward: the `cost-report-contract.md` `--axis` claim (task 2) and the task 3.2 recording-
survives-the-CLI gap (task 3) are both fixed and tested above, in the same phase. No open
follow-up remains from this phase.

## Assert pass — `/aidd-dev:03-assert`, run after phase 6

A consolidated sweep against `cli/aidd_docs/memory/coding-assertions.md`'s six requirements
and five before-commit/before-push commands, across every file this whole plan (phases 1-6)
touched — not just phase 6's own diff.

**One real finding, fixed.** `pnpm jscpd` flagged a clone inside this plan's own files:
`asObject` — an identical `(value: unknown) => Record<string, unknown> | null` narrowing
helper — duplicated verbatim between `infrastructure/adapters/telemetry-evidence-adapter.ts`
(phase 4) and `infrastructure/adapters/export-config-reader-adapter.ts` (phase 5), each with
its own private copy. Extracted to `src/domain/formats/plain-object.ts` (`asPlainObject`,
with a doc comment naming exactly this problem), both adapters now import it, and
`tests/domain/formats/plain-object.unit.test.ts` (4 tests) pins its four cases (object,
array, null, primitive). Verified: `jscpd`'s clone count dropped 81 → 80, and the remaining
80 are all pre-existing, none touching any file this plan added or modified.

**Left alone, on purpose.** `infrastructure/adapters/person-identity-adapter.ts` carries its
own third copy of the same shape, pre-existing and outside this plan's diff — not touched,
since its contract differs (`{}` on failure, never `null`) and touching a file no phase of
this plan otherwise names would be scope creep beyond "leave no debt from this plan's own
changes."

**Checked and judged compliant, no fix needed.** The two adapters' bare `catch { return
null }` / `catch { return false }` (reading a project's optionally-absent settings or config
file) were checked against "no silent errors — throw early, fail loudly." The codebase
already carries a deliberate dual pattern for this exact tension, in the same
`person-identity-adapter.ts`: a lenient `read()` (bare catch, `null` on anything wrong) beside
a strict `readStrict()` (rethrows a named `UnreadableIdentityFileError` once the file is
confirmed to exist but fails to parse). This plan's two adapters follow the lenient shape,
which matches `aidd telemetry check`'s own design: every claim is a verdict, never a crash,
so a diagnostic that threw on a malformed `settings.json` would defeat its own purpose.
**One real UX edge this does accept, named rather than left implicit:** a genuinely
malformed `.claude/settings.json` (bad JSON, not merely absent) currently reads as "export
not configured" — the same line as a settings file that was never touched — rather than
"your settings file is corrupt." Defensible for a diagnostic that must always answer, but a
person debugging why their own export never turned on would get a less specific message
than the file's own error could give them. Worth a small follow-up issue if that
distinction ever matters in practice; not fixed here, since nothing in any of the six
phases' acceptance criteria asks for it.

**Everything else, verified clean, nothing to fix:** `tsc --noEmit`, `pnpm lint` (biome),
zero new runtime dependency imported anywhere in this plan's files (the 6-dependency cap
stands untouched), every domain file this plan added imports only from `domain/` (checked
by hand and by `check-cli-layering.mjs`), `pnpm build` (554.7 KB, within the 560 KB budget).

### Final sweep, one pass, nothing regressed

```
cli unit           2111 passed  (was 2107; +4 plain-object.unit.test.ts)
cli integration      608 passed  (unchanged)
cli e2e              215 passed  (unchanged)
pnpm test (all three projects together)   2934 passed
plugin suite (node --test)                237 passed  (unchanged)
tsc, biome, knip:production, check-cli-layering, check-markdown-links   clean
jscpd   80 clones (was 81; the one inside this plan's files fixed, the rest pre-existing
        and outside every file this plan touches — informational in CI, not a hard gate)
```

## Review pass — phases 4-6, and the one contract it found unguarded

The phases-4-6 review (`review.md`, verdict **approved**) started from what was *deleted*
rather than from what shipped: the 99 test titles of `scripts/__tests__/telemetry-check.test.js`
mapped against their new homes. The deleted suite held three identity guards — `switch.cjs`,
`repo.cjs` and `unrecognised.cjs` each "stays identical to the hook's own". Two are moot now
(the CLI reimplements them in TypeScript, and `telemetry-plugin-standalone.e2e.test.ts` drives
the real hook end to end, which is stronger than a byte comparison). The third was not, and
nothing had replaced it.

**Found by mutation, not by reading.** `unrecognised_payload` is written in
`hooks/lib/record.cjs:268` and read in `telemetry-evidence-adapter.ts:30` — two packages, two
languages, one string. Renaming the hook's literal to `unknown_payload` left
`telemetry-check.e2e.test.ts` **11/11 green** and `aidd-telemetry-journal.test.js` **186/186
green**: the plugin side asserts only that the marker *file* exists, never its `type`, and the
CLI side typed the same literal into its own fixture, so it was checking itself against itself.

The cost was never a failed run — it was a wrong answer. With the marker unread, a payload
that *did* arrive reports as "the hook has never been observed firing": an unknown printed as
a nothing, the one thing this layer promises never to do.

**Fixed by making the hook produce the fixture.** A twelfth case in
`telemetry-check.e2e.test.ts` spawns `hooks/journal.cjs session-start` with a payload matching
no declared host and reads whatever file the hook writes. Re-mutated to prove the guard bites:

```
× names an unrecognised payload the real hook wrote, not one this test typed
  → expected '  hook fired            FAIL  no run ...' to match /matched no known host/u
```

That failure message *is* the degradation. The cheaper stopgap — asserting the literal from
`record.cjs` in the plugin suite — was deliberately not taken: it pins the string, not the
contract.

```
cli e2e   216 passed / 30 files   (215 before; +1)
tsc, biome   clean
plugins/aidd-telemetry/hooks/   restored byte-identical after each mutation, tree clean
```


## Review pass 2 — `/aidd-dev:05-review`, independent, all 6 phases

Run by a fresh `aidd-dev:checker` agent, not the executor who wrote the code — the
executor's own guardrail forbids judging its own work. Corrected three things about the
brief it was given: the branch is `claude/telemetry-cli-owns-read`, not
`claude/aidd-telemetry-layer-e403uf` (a merge-base); the work is already committed
(`7fe3e101..d08c3d57`, 6 commits) — only the `plain-object.ts` extraction and its adopters,
the twelfth `telemetry-check.e2e.test.ts` case, and this file were still uncommitted; e2e
was 216, not 215 (this file's own phase-6 section undercounted by one, written before the
prior review pass's twelfth case landed).

**Verdict: changes-requested — 0 critical, 4 warning, 2 minor.** All six fixed in this
pass; each verified independently below, not just re-asserted.

1. **🟡 rot** — `scripts/__tests__/aidd-telemetry-cost-skill.test.js`'s `reportCommands()`
   still matched `` `node <telemetry-report.cjs> …` ``, a pattern phase 1 deleted every
   instance of. Zero matches, empty array, the loop asserting "every report call names
   `--json` or `--axis`" passed by iterating nothing — enforced nowhere. Fixed: the pattern
   now matches `` `aidd telemetry report <flags>` ``, anchored so a bare mention of the
   command in prose (SKILL.md's transversal rules) still cannot match, plus an explicit
   `assert.ok(commands.length > 0)` floor so this exact silent-emptying cannot recur
   unnoticed. Confirmed non-vacuous: the four real commands in `01-cost`'s markdown are
   found and checked.
2. **🟡 code** — `hook-trust-reader-adapter.ts`'s `describeError` read `error.message`
   where the deleted `hook-trust.cjs:57` read `error.code || error.message`. Live before
   the fix: `Codex's own hook trust state could not be read either (.../config.toml could
   not be read (ENOENT: no such file or directory, open '.../config.toml')` — the path
   twice in one sentence. Fixed to prefer `.code`; live after: `... could not be read
   (ENOENT))`. Left distinct from `person-identity-adapter.ts`'s own `describeError`
   (`.message` only) rather than merged into one shared helper — that one describes a JSON
   parse error, which carries no useful `.code`; unifying them would paper over a real
   difference in what the two are describing.
3. **🟡 rot** — `docs/FAQ.md` still said "nothing ever leaves your machine" unqualified in
   two places, while `README.md`'s own rewrite (this plan) qualified it with "on its own"
   — the `aidd telemetry endpoint` exception. Both FAQ lines now read "on its own" too.
4. **🟡 fit — issue #617.** Real, stale rationale, not a lost capability: #617 argues "The
   CLI keeps one job only: turning the export on. Everything that reads belongs to the
   plugin," which this plan's own `aidd telemetry check` contradicts by design, and no file
   in the diff answers that argument. The reviewer independently confirmed the mechanism
   still works from inside a session (`resolveSessionAnchor` reads the inherited
   `CODEX_THREAD_ID`/`CLAUDE_CODE_SESSION_ID`) — so #617's *acceptance criteria* are met,
   only its stated design preference is overridden. **Not resolved by the executor**:
   commenting on a live GitHub issue is an external side effect outside this session's
   authority to take unprompted, the same as a commit. A reconciling comment is drafted and
   held for the user's go-ahead, not posted.
5. **🟢 rot** — `aidd-telemetry-cost-skill.test.js`'s `scriptFlags()` was dead: defined,
   never called, parsed a deleted script's source. Removed.
6. **🟢 code** — noted alongside finding 2 above (`describeError` "duplication" was a
   byproduct of finding 2's bug, not a separate defect — fixing the semantics diverged the
   two functions, which is what should have been true from the start).

### Re-verified after the fixes, one pass

```
cli unit           2111 passed  (unchanged)
cli integration      608 passed  (unchanged)
cli e2e              216 passed  (unchanged — the fixes touched no e2e assertion's shape)
pnpm test (all three projects together)   2935 passed
plugin suite (node --test)                237 passed  (unchanged — same 19 tests in the
                                                        fixed file, no longer vacuous)
tsc, biome, knip:production, check-cli-layering, check-markdown-links   clean
jscpd   80 clones (unchanged — the describeError pair was already below threshold; fixing
        it for correctness diverged the two functions rather than removing a counted clone)
```

Outstanding before merge, unchanged from before this pass: the diff review is now done
(`review.md`, this section); #617 needs the user's decision on the drafted comment before
it is posted.
