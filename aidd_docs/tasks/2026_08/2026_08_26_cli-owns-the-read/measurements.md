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
