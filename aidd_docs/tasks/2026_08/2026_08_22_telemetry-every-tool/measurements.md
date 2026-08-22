# Measurements

Every entry below records a probe that actually ran — never a reading of documentation.

## Phase 4 — Cursor: does a plugin-scope hook fire at all

### Budget

Two real `cursor-agent` invocations against the live API, of a budget of three.

1. A dry-run sanity check (`cursor-agent agent "say PING" --force --trust`, no hooks configured) —
   confirmed a bare prompt works and that omitting `-p` with non-tty stdin still completes a
   turn and exits, rather than hanging. Spent by mistake, before any hook was wired up; kept
   here because it is real spend and the budget is honest about it.
2. One comprehensive interactive probe (below), covering both open questions — plugin-scope
   firing and `stop` vs `sessionEnd` — in a single session, driven through a real pty via
   `expect` so the process saw `-p` was **not** passed.

The third session was not used: the second one was decisive on every question this phase
needed settled, and the guidance was to diagnose before retrying, not to spend the budget on
confirmation once the result was already clear.

### What was set up

- A scratch project under `/private/tmp/.../cursor-probe-project`, installed via the real
  `aidd ai install cursor` and `aidd plugin install <repo>/plugins/aidd-telemetry --tool cursor
  --scope user --yes` — the production install path, not a hand-authored fixture. This wrote
  `~/.cursor/plugins/local/aidd-telemetry/hooks.json` (auto-discovery route, no manifest —
  see "What registers a plugin" below).
- A project-scope `.cursor/hooks.json` in that same project declaring all seven events named
  in issue #680's original probe (`sessionStart`, `beforeSubmitPrompt`, `preToolUse`,
  `postToolUse`, `beforeReadFile`, `stop`, `sessionEnd`), each appending a timestamped line to
  its own log file.
- A second plugin, `zz-hook-manifest-probe`, hand-built at
  `~/.cursor/plugins/local/zz-hook-manifest-probe/`, declaring the same seven events, **with**
  a `.cursor-plugin/plugin.json` manifest built to match the schema `cursor-agent`'s own
  bundle validates against (extracted from its minified `index.js` — see below), and loaded
  explicitly with `cursor-agent --plugin-dir <path>` in addition to sitting in the
  auto-discovery location.

One session therefore exercised three independent things at once: project scope, plugin
scope via auto-discovery (the real `aidd-telemetry` plugin), and plugin scope via explicit
`--plugin-dir` with a manifest.

### The interactive run

`cd` into the probe project; via `expect` driving a real pty:

```
cursor-agent agent "Read the file README.md if it exists, otherwise just say NOFILE.
  Then reply with exactly the word DONE and stop." --force --trust \
  --plugin-dir ~/.cursor/plugins/local/zz-hook-manifest-probe
```

No `-p`. The transcript (ANSI stripped) shows a real completed turn: `I'll check whether
README.md exists and read it if it does. → Read README.md → DONE`, then the CLI back at its
input prompt showing `/exit` / `/quit` autocomplete. The outer harness killed the process
after its own two-minute limit while `expect` was still trying to send `Ctrl-D` / `/exit` to
close it cleanly — the session did real work and completed a turn; it did not shut down
gracefully afterward.

**Project scope — fired:**

| Event | Fired | Timestamp (UTC) |
| --- | --- | --- |
| `sessionStart` | yes | 05:47:35 |
| `beforeSubmitPrompt` | yes | 05:47:35 |
| `preToolUse` | yes | 05:47:38 |
| `beforeReadFile` | yes | 05:47:38 |
| `postToolUse` | yes | 05:47:39 |
| `stop` | yes, twice | 05:47:42 (×2) |
| `sessionEnd` | **not observed** | — |

`stop` firing interactively is a new result — every probe before this one was headless, and
headless never fired it. `sessionEnd` not appearing here is **not** read as Cursor
withholding it: the process was force-killed mid-shutdown while sitting at the exit
autocomplete, which is exactly the state where a graceful-shutdown-only event would be lost.
The two `stop` firings 30 ms apart have no established cause; recorded as observed, not
theorized about.

**Plugin scope — fired: nothing.** Zero of seven events, on both plugins present during this
same turn:

- `aidd-telemetry` (auto-discovered at `~/.cursor/plugins/local/aidd-telemetry`, the real
  production install, no manifest) — its hooks call `node ./hooks/journal.js ...`, which
  writes to `<project>/aidd_docs/runs/`. That directory was never created. No journal entry
  exists for this session.
- `zz-hook-manifest-probe` (loaded explicitly via `--plugin-dir`, **with** a
  `.cursor-plugin/plugin.json` manifest matching Cursor's own schema) — none of its seven log
  files were written.

No error, warning, or mention of either plugin appears anywhere in the transcript. Silent,
exactly like the two prior headless probes recorded in issue #680.

### What registers a plugin for Cursor

Established, not left unknown:

- `cursor-agent plugin --help` exposes exactly one subcommand family: `marketplace` (`add`,
  `list`, `remove`, `update`), all keyed to a git URL. There is no `plugin install`, `plugin
  list`, or anything that names a local directory as installed.
- `cursor-agent plugin marketplace list` on this machine lists five marketplaces
  (`cursor-public`, `buildwithclaude`, `impeccable`, `caveman`, `mixedbread-grep`) — no
  marketplace for this framework, and nothing that would cause `~/.cursor/plugins/local/*` to
  be recognized.
- `--plugin-dir <path>` is the one explicit, non-marketplace registration mechanism the CLI
  exposes. It was used, pointed at a plugin with a schema-valid manifest, during a session
  that completed a real turn with project-scope hooks firing throughout — and produced no
  observable effect.
- Grepping the installed `cursor-agent` binary's own bundle
  (`~/.local/share/cursor-agent/versions/*/index.js`) for `.cursor-plugin/plugin.json` finds
  the marketplace-entry validator: manifest candidates `[".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json", "plugin.json"]`, required `name` (kebab-case), optional
  `hooks`/`agents`/`skills`/`mcpServers`/etc. This is the schema the hand-built manifest for
  `zz-hook-manifest-probe` was built against. The string `plugins/local` does not appear
  anywhere in that bundle; neither does any scan-a-directory-for-manifests routine tied to
  `~/.cursor/plugins/local`.
- The real, currently-installed `aidd-telemetry` plugin (via `aidd plugin install ... --tool
  cursor --scope user`) writes **no** manifest at all — `cursor.ts` declares
  `pluginManifestRelativePath: null` for Cursor, and always has (no prior value in git
  history). Its `hooks.json` sits directly at the plugin root
  (`~/.cursor/plugins/local/aidd-telemetry/hooks.json`), matching exactly what the two
  headless probes in issue #680's second comment describe.
- Some *other*, pre-existing local plugins on this machine (`aidd-context`, the test fixture
  `aidd-test`) **do** carry a `.cursor-plugin/plugin.json` and a nested `hooks/hooks.json` —
  but in the old, unconverted Claude shape (`PascalCase` event names, `${CURSOR_PLUGIN_ROOT}`
  left unsubstituted), evidence of an older build/install path this repo's git history no
  longer produces. Their presence does not establish that a manifest makes Cursor discover a
  plugin — only that Cursor's own schema, at some point, mattered enough for something to
  write to it.

Taken together: the only mechanisms Cursor's CLI exposes for registering a plugin are
marketplace-based (`plugin marketplace add` against a git repo) or the explicit `--plugin-dir`
flag. The framework does not use the marketplace route. `--plugin-dir`, tried directly, had no
observable effect. Auto-discovery of `~/.cursor/plugins/local/*` — the mechanism the
framework's install has always assumed — has no support anywhere in the binary's own strings,
and three probes across headless/interactive, with/without a manifest, and with/without
`--plugin-dir` produced the same result: nothing.

### Bounds

The three plugin-scope probes (this one plus the two in issue #680's second comment) differ on
more than one axis at a time — headless+auto-discovery+no-manifest (×2, prior) vs.
interactive+`--plugin-dir`+manifest (this one). They are not a clean isolation of which
variable matters; they are three attempts that varied every plausible fix simultaneously and
all came back empty. That is enough to conclude no configuration tried makes plugin-scope
hooks fire — it is not enough to say which single change, if any, would.

### Conclusion and what changed

Plugin-scope hooks are the only route the framework installs a Cursor hook through
(`cursor.ts`: `hooksContentFormat: "cursor"`, `installScope: "user"`,
`userPluginsDir: ~/.cursor/plugins/local`). Since that route fires nothing — regardless of
which event name it would map to — `CURSOR_EVENT_MAP` in `flat-hooks-merge.ts` is not touched.
Nothing in this probe shows the mapping is wrong; it shows the mapping's output is never read
by anything. Task 2.1 ("map whatever marks the end of the work") does not apply — its
precondition ("plugin hooks fire and `stop` does not") is false on both halves. Task 2.2
applies: Cursor is declared uncovered on the journal route, with this probe as the reason.

Changed, to say that:

- `plugins/aidd-telemetry/skills/01-cost/scripts/lib/readers.js` and its byte-parity-guarded
  copy at `plugins/aidd-telemetry/skills/02-check/scripts/lib/readers.js`: Cursor's
  `capability.journalAttributable` flips from `true` to `false`, with a `reason` naming this
  probe. It was declared `true` with no capture behind it — the exact false-claim-by-omission
  this deliverable exists to remove (see spec.md's "Done when": every claim cites a capture).
  `journalAttributable: true` was not exercising any live code path before this change (see
  below), but it was a false statement printed verbatim into every JSON cost-report envelope
  (`journal_attributable: true` for a tool that has never been observed reaching a journal).
- `scripts/__tests__/telemetry-cost-readers.test.js`: the test asserting which tools are
  journal-unreachable (`"says which tools the journal never names"`) expected exactly
  `["opencode"]`; updated to `["cursor", "opencode"]`.

Both copies stay byte-identical (`diff` confirmed); the guard test
(`scripts/__tests__/telemetry-check.test.js`, `"keeps readers.js identical to the cost
skill's own copy"`) passes.

### Found, not changed — flagged for the planner

`cli/src/domain/tools/ai/cursor.ts` declares `telemetryJournalHost: "cursor"`. Per
`cli/src/application/use-cases/telemetry/report-cost-use-case.ts:36`,
`journalAttributable: config.telemetryJournalHost !== undefined` — so the **TypeScript** `aidd
telemetry report` path computes `journalAttributable: true` for Cursor, the opposite of what
this probe found and the opposite of what the plugin's own `readers.js` now says. These are
two independent implementations by design (the plugin's Node scripts are bundled standalone
into each tool's directory so a live session can run them without the `aidd` npm package; the
CLI has its own TypeScript model) and no test pins them to agree on this specific field — the
one byte-parity e2e test that compares plugin output to CLI output
(`cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts`, `"answers exactly what the CLI
answers"`) only exercises a Claude Code fixture, so it does not currently catch this
divergence.

`contracts.ts` documents `telemetryJournalHost` as "Absent for a tool the journal hook does
not run under" and notes it is "pinned to a table by a test" (`DECLARED_HOSTS`) shared with
`telemetryTaskAttributable`'s `WRITTEN_PATH_EXTRACTOR_BY_HOST`. Removing it is not a
one-line flip: it changes what `journalHostToAiToolId("cursor")` in `registry.ts` returns for
any journal line that ever does carry `host: "cursor"`, and it interacts with a table pinned
by a test this phase was not asked to touch and that was not in the architecture projection
for this phase (`flat-hooks-merge.ts`, `docs/telemetry-limits.md`, this file). Left as-is,
named here rather than fixed silently, per the instruction to stay in scope and declare what
is bypassed.

### What `docs/telemetry-limits.md` should say

The existing "Cursor cannot be measured at all" section covers the **read** routes only
(local read, OTLP export) — "uncovered by both routes" refers to those two, not to
journaling, which is a third, separate mechanism (a hook marking a step or turn boundary,
independent of whether a figure can be read back). That section's claims stand un-contradicted
by this probe. What is missing is a statement about the journal route specifically: Cursor's
plugin-scope hook — the only route the framework installs one through — was never observed
firing, on three independent probes spanning headless and interactive, auto-discovered and
explicitly loaded via `--plugin-dir`, with and without a manifest matching Cursor's own
schema. Project-scope hooks do fire, including `stop` interactively — but the framework does
not install to project scope, so that is not a route to anything today. Cursor is uncovered on
all three axes the spec names (journal, local read, export), each for its own measured reason,
not one blanket "cannot be measured."

### Restoration

Everything scratch lived under `/private/tmp/.../scratchpad/cursor-probe-project` and
`cursor-probe-logs` — nothing there needs restoring. Outside the repo, the real
`~/.cursor/plugins/local/` was modified for this probe and has been restored:

- Removed: `~/.cursor/plugins/local/aidd-telemetry` (installed fresh for this probe via the
  real `aidd plugin install`) and `~/.cursor/plugins/local/zz-hook-manifest-probe`
  (hand-built for this probe).
- Untouched: `aidd-context`, `aidd-dev`, `aidd-orchestrator`, `aidd-pm`, `aidd-refine`,
  `aidd-test`, `aidd-ui`, `aidd-vcs` — all pre-existing on this machine before this probe, not
  created or modified by it. `aidd-test` in particular is a test fixture another agent's test
  suite may depend on; verified it existed (with the same content) before this session
  started and left it exactly as found.

## Phase 4 addendum — project-scope install does journal, interactively

The coordinator's read of the first pass was right: the first pass showed the route Cursor
is *installed to* never fires, not that Cursor refuses to run the framework's hooks at all.
Project-scope firing `stop` interactively (measured above) was the same signal `OpenCode`'s
flat-merge route already exists to use. This addendum tests that route directly, using the
third and last budgeted session.

### What was built and run

- `aidd framework build --source <repo> --target cursor --out <scratch-project> --flat
  --force` — the real, already-shipped `cursor:flat` build target
  (`buildCursorFlatContract` in `tool-contracts.ts`, `FlatBuildStrategy`), run against the
  actual repo. Not hand-simulated: this is the same code `mergeCursorFlatHooks` and
  `CURSOR_EVENT_MAP` already serve, just never previously pointed at a live Cursor session.
- It produced a project-scope `.cursor/hooks.json` with `sessionStart`, `stop`, and
  `postToolUse` (`CURSOR_EVENT_MAP`'s translation of the plugin's own `SessionStart`/`Stop`/
  `PostToolUse`), each command reading `node ./.cursor/hooks/aidd-telemetry/journal.js
  <event>` — and copied `journal.js` and its `lib/` alongside at
  `.cursor/hooks/aidd-telemetry/`.
- **The `./` question, settled:** commands resolve relative to the **project root** (the
  directory holding `.cursor/`), i.e. Cursor invokes hook commands with that as `cwd`. Two
  independent confirmations: `resolveClaudeRootRelative` in `flat-build-strategy.ts` builds
  `./` + a path already rooted at `.cursor/hooks/...` (so it only resolves correctly if `cwd`
  is the project root, not `.cursor/`), and the very first probe's hand-written `sh
  ./hooks/log.sh` — sitting at `<project>/hooks/log.sh`, not under `.cursor/` — already
  worked from a project-scope `.cursor/hooks.json`.
- **Gating discovered, free (no paid session):** `journal.js`'s `record.handleSessionStart`
  requires `.aidd/config.json` to hold `{"telemetry":{"enabled":true}}` before it writes
  anything (`repo.js:telemetryEnabled`) — this is not particular to Cursor, every host is
  gated the same way, but it was not yet turned on for the scratch project and the first
  synthetic dry run silently produced nothing until it was. Turned on via the real `aidd
  telemetry on` (which also errors requesting an OTEL endpoint — irrelevant to this local
  gate, since it writes the `enabled: true` flag before that check).
- **A second gate discovered, free:** for Cursor specifically,
  `REPO_ROOT_BY_HOST.cursor` in `repo.js` resolves the repo root from the hook payload's own
  `payload.workspace_roots` field, not from `process.cwd()`. A synthetic payload lacking that
  field silently wrote nothing, twice, before this was found — by design (every other host
  but Cursor is trusted to report its own cwd correctly; Cursor's is read from what the
  payload itself names). Confirmed by direct, free (no cursor-agent) calls to `journal.js`
  with and without `workspace_roots` present.

### The real interactive run

Same pty-driven `expect`, no `-p`, same prompt (read `README.md`, reply `DONE`), this time
against the flat-installed project. Each hook command additionally `tee`'d its own stdin to a
capture file so the real Cursor payload shape could be inspected regardless of whether
`journal.js` accepted it.

**A run journal file was written**, for the real session, with the real payload:

```
{"type":"session_start","at":"2026-08-22T06:02:30Z","schema_version":2,"run_id":"01M0M10H7QREWQ7KTTKFK05REK","project_id":"cursor-probe-project2","project_remote":null,"tool":"cursor","vendor_id":"c8cbd455-98ad-41a0-9511-f86e2fb06c17","vendor_field":null}
{"type":"turn_end","at":"2026-08-22T06:02:38Z"}
{"type":"turn_end","at":"2026-08-22T06:02:38Z"}
```

`vendor_id` is Cursor's own real conversation id, taken straight from its payload. This is
the decisive result of the phase: **installed at project scope, Cursor's hooks fire and the
journal writes, interactively.**

The captured real payloads confirm the assumed shape and add detail:
`cursor_version`, `session_id`, `hook_event_name`, `workspace_roots` all present as expected;
also `conversation_id`, `generation_id`, `model`, `user_email`, and a `transcript_path`
pointing at `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` — Cursor's own
transcript file, whose contents were not examined (out of scope here; a fact for whoever next
looks at Cursor's local-read route, not a claim this phase makes about it).

**Why `stop` fired twice, now known, not just observed:** the two captured `stop` payloads
carry `status: "error"` then `status: "aborted"` — two distinct real events, not a duplicate
delivery. `stop` can fire more than once in one session (at least once on an internal error,
again on the interactive process being torn down), and each firing writes its own
`turn_end` line. That is a real turn-boundary-fidelity question — whether a run should be
allowed more than one `turn_end` — but acting on it is outside this phase; named here so it
is not lost.

### What this changes, and what it does not

**`journalAttributable` reverts to `true` for Cursor**, in
`plugins/aidd-telemetry/skills/01-cost/scripts/lib/readers.js` and its byte-parity copy —
undoing this phase's earlier change. That earlier change was itself a measurement error: it
generalized "the shipped install route never fires" into "the journal can't be attributed to
Cursor," and this probe shows those are different claims. `journalAttributable`'s own
documented meaning — "a sweep of the journal reaches one of that tool's sessions" — is now
verified true. The comment above the declaration was rewritten to say exactly this, and
to record that the shipped native/plugin-scope install still does not fire — a route defect,
not a capability limit, and not this phase's to fix (see below).

**Not changed, per the explicit instruction to probe rather than implement:** `cursor.ts`'s
`plugins` capability (`mode: "native"`, `installScope: "user"`,
`userPluginsDir: ~/.cursor/plugins/local`) is untouched. Switching Cursor's actual install
route from native/plugin-scope to the already-built `cursor:flat` target is a real, scoped
decision — it changes what a Cursor project looks like after install, interacts with
whatever else `mode: "native"` currently does for Cursor (skills, agents, MCP, none of which
this phase probed), and deserves its own plan rather than an improvised change here.

**The headless gap, stated without a fourth session.** Issue #680's original project-scope
probe was headless, and fired `sessionEnd`, not `stop` — five of seven events, `stop` and
`beforeSubmitPrompt` absent. The telemetry plugin's own `hooks/hooks.json` only declares
`SessionStart`, `Stop`, and `PostToolUse` — no source event that `CURSOR_EVENT_MAP` (which
has no `SessionEnd` key at all) could map to Cursor's `sessionEnd`. So, inferred from #680's
capture rather than re-measured here: a project-scope install would journal `session_start`
but **no turn boundary** headless, with the hook set as it stands today. Interactively
(measured, this session) it journals both. Whoever plans the route change should decide
whether to accept the headless gap, add a `SessionEnd`-sourced hook to the plugin, or extend
`CURSOR_EVENT_MAP` and `HOOK_EVENT_NAME_TO_CANONICAL` in `journal.js` to also recognize
`sessionEnd` as a turn boundary — three different-sized changes, not one.

### The disagreement test

`cli/tests/domain/tools/registry-conformance.unit.test.ts`: `"agrees with the plugin's own
cost-report declaration on journalAttributable"`.

For every registered `AiTool`, it computes `journalAttributable` the same way
`report-cost-use-case.ts:36` does (`telemetryJournalHost !== undefined`) and compares it,
tool by tool, against `TOOLS[].capability.journalAttributable` in the plugin's own
`readers.js` — reached via a new test helper,
`cli/tests/helpers/telemetry-cost-readers.ts`, following the same `createRequire` pattern
`telemetry-journal-hook.ts` already uses to reach the hook's CommonJS files without a second,
hand-copied table. A tool present in one side and missing from the other fails by name, not
silently. On first run, before the readers.js revert above, it caught the live disagreement
this phase produced — Cursor `true` on the CLI side, `false` on the plugin side — which is
the evidence it does what it is for. After the revert both sides read `true` and the test
passes; nothing on the CLI side needed to change, because the CLI side was the one that had
been right.

### Restoration, updated

Same as before: `~/.cursor/plugins/local/` was not touched in this addendum (the `cursor:flat`
build wrote only into the scratch project's own `.cursor/`), and it still holds only the
pre-existing plugins (`aidd-context`, `aidd-dev`, `aidd-orchestrator`, `aidd-pm`,
`aidd-refine`, `aidd-test`, `aidd-ui`, `aidd-vcs`) untouched by any probe in this phase. No
`cursor-agent` process was left running. Budget: 3 of 3 real sessions used; the third was
this one.

## Phase 5 — OpenCode: does anything running inside a session see its own id

### Budget

Three real `opencode run` invocations against the live API (Anthropic OAuth, already
configured on this machine), of a budget of three - all spent establishing the extension
surface and its two failure modes before anything worked. Every further diagnostic after
that point used free, non-billed OpenCode operations instead of retrying against the
budget: `opencode session list` / `opencode models` (bootstrap plugins, create no session),
and `opencode serve` plus a direct `POST /session` against its own HTTP API (creates a real
session, with a real `ses_…` id, at zero cost - billing happens on a message, not a
session). The decisive proof that the join works end to end (below) was obtained this way,
spending none of the three-session budget.

1. A bare-function-export plugin (`module.exports = async function(input) {...}`) - no
   observable effect.
2. A `{server: fn}`-shaped export (matching the `PluginModule` type in
   `@opencode-ai/plugin`'s own shipped `.d.ts`, found at
   `~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`) - still no
   observable effect.
3. The same `{server: fn}` file, re-run to rule out a one-off - identical: no log line, no
   error, in any of three sessions' full `--print-logs` stderr.

All three real sessions confirm the surface exists and is discovered (`service=plugin
path=.../probe.js loading plugin` fires every time), and confirm OpenCode's own event bus
carries a real session id at the moment a plugin would need one
(`service=session id=ses_… ... created` and `service=bus type=session.created publishing`,
both from OpenCode's own logging, independent of anything the plugin does). What no real
session ever showed was the plugin's own code running - not even a synchronous top-level
`fs.appendFileSync` placed as the first line of the module, guarded in its own try/catch.
Per the guidance to diagnose before retrying, and the hard stop at three, no fourth `opencode
run` was spent chasing this - the free commands below did instead, and settled it.

### What OpenCode's extension surface actually is

Not read from documentation - extracted from the installed `opencode` binary's own
behaviour and, for the loader's exact validation logic, from `strings` on the compiled
binary itself (`/opt/homebrew/Cellar/opencode/1.14.20/bin/opencode`), since the CLI ships as
a single Bun-compiled executable with no separate source to read:

- **Auto-discovery.** `opencode plugin <module>` (npm-only) is not the framework's route.
  Every project directory `opencode` walks up to, plus `OPENCODE_CONFIG_DIR` if set, is
  globbed for `{plugin,plugins}/*.{ts,js}` (the literal pattern, extracted from the binary's
  own strings: `D7.scan("{plugin,plugins}/*.{ts,js}",{cwd:$,absolute:!0,dot:!0,symlink:!0})`).
  A file placed at `<project>/.opencode/plugin/*.js` is found with no config entry at all -
  confirmed live: every probe's `--print-logs` output named the exact path.
- **The loader's own validation, decompiled from the binary.** For each discovered module,
  `yL(mod, spec, "server", "detect")` reads `mod.default`; if that is a plain object
  carrying `id`/`server`/`tui`, its `.server` is called directly as the plugin. If not - a
  bare function is not a "plain object" by this check - the loader falls back to `qq0(mod)`,
  which walks `Object.values(mod)`, dedupes, and calls every function-typed export it finds.
  Both paths were reachable by the shapes tried; neither one ever ran.
- **The real, working reference on this machine.** `~/Library/Application Support/
  orca/opencode-hooks/shared/plugins/orca-opencode-status.js`, installed by a different tool
  (Orca) already running on this machine as a production dependency, uses genuine ESM:
  `export const OrcaOpenCodeStatusPlugin = async (_ctx) => {...}` - a named export, no
  `default`, no `{server}` wrapper. That file's own `service=plugin ... loading plugin` line
  appears in every capture alongside the probe's.

### Finding 1: OpenCode's loader requires a genuine ESM export

Free, via `opencode models` (loads plugins, creates no session): a file identical in every
way to the failing CommonJS attempts except for its export statement -

```js
export const ProbePlugin = async (input) => {
  fs.appendFileSync(LOG, JSON.stringify({ at: "esm-server-called", directory: input.directory }));
  return { event: async ({ event }) => { /* ... */ } };
};
```

- ran on the very first attempt. The log file existed after the command returned, with both
the module's own top-level log line and the `server()` call's, `directory` correctly naming
the project root. No CommonJS variant - bare function, `{server: fn}`, or a version carrying
every alias (`module.exports`, `.default`, `.server`, a named property) at once - ever
produced this, across three billed sessions plus repeated free attempts. The conclusion
this phase draws is precise: **the plugin module itself must be ESM** (`import`/`export`),
regardless of file extension (`.js` works; the loader sniffs content, not the name, exactly
as OpenCode's own bundled reference plugin does).

### Finding 2: the id is seen, with zero AI spend, once the export is fixed

Still free - `opencode serve --port <p>` (a headless server, no session created on its own)
plus a direct `curl -X POST http://127.0.0.1:<p>/session`, which creates a session (a
database row and a `session.created` event) without ever sending a message, so no model is
ever called and nothing is billed:

```json
{"at":"esm-event","type":"session.created",
 "properties":{"sessionID":"ses_fd7d6e979ffed8boswipOz9USp",
   "info":{"id":"ses_fd7d6e979ffed8boswipOz9USp", "directory":"/private/tmp/.../opencode-probe", ...}}}
```

`opencode export ses_fd7d6e979ffed8boswipOz9USp --sanitize` (the exact command
`opencodeRead` in `readers.js` already shells out to) accepted that same id and returned the
session's own record - the identical id the plugin's `event` hook saw is the one
`mapOpencodeExportToSinkRecords`/`opencodeRead` already key their `vendor_id` on. The
question phase 5 exists to answer - does anything running inside a session see that
session's own identifier, and is it the same one the reader already uses - is settled,
affirmatively, by a live capture.

### Finding 3: the loader cannot see a local CommonJS file's exports either

A second, independent limit, found while wiring the actual join: `await
import("./lib/record.js")` from inside a loaded OpenCode plugin resolves to a namespace with
**zero** own properties - no `default`, no named export - even for a one-line throwaway file
(`module.exports = { foo: 42, bar: () => "hi" }`), while a **genuinely ESM** sibling file
(`export const foo = 42;`) imports correctly, both by relative path and by an absolute
`file://` URL. So this is not a resolution problem (the file is found, `import()` resolves
without throwing) - it is specifically that OpenCode's loader does not perform CommonJS/ESM
interop for a plugin's own further imports, the same gap Finding 1 already showed for the
plugin's own top-level export. `hooks/lib/record.js` and `hooks/lib/repo.js` - the shared,
zero-dependency journal primitives every other host's hook already runs through - are
CommonJS, and stay CommonJS: they are `require()`d as a child process by `journal.js` under
Claude Code, Codex, Copilot and Cursor's own `hooks.json`, and converting them to ESM to
suit OpenCode alone would touch every one of those paths for no gain.

### The design this settles on

`hooks/opencode-plugin.js` does not import `lib/record.js` in-process at all. It spawns
`journal.js` - the exact same child process every other host's hook already runs - over the
same stdin-JSON contract, from `session.created` and `session.idle`, naming the payload
`{tool: "opencode", session_id, cwd}` so `detectHost` (`lib/host.js`) recognises it without
inventing a fifth vendor-payload shape to guess at (every other host's shape was reverse
engineered from a capture nobody here controls; this one is authored by this plugin, so it
gets to name itself unambiguously). One more free-tier bug caught this way, also live: the
first version spawned `process.execPath` - which names the `opencode` binary itself, not a
Node runtime, since OpenCode ships as its own standalone executable - and silently ran
nothing; fixed by spawning `node` explicitly.

End to end, free, via the same `opencode serve` + `POST /session` route: a real journal line
appeared, matching the shape every other tool's `session_start` line already has -

```json
{"type":"session_start","at":"2026-08-22T06:36:55Z","schema_version":2,
 "run_id":"01M0M2ZJJCGFWB1NW9VX20ZPN2","project_id":"example/opencode-probe",
 "project_remote":"https://github.com/example/opencode-probe.git","tool":"opencode",
 "vendor_id":"ses_fd7d035efffeEkq6HyYAWt9Z63","vendor_field":null}
```

Then the actual sweep - `node telemetry-report.js read`, with no `--session` named by hand,
run against the project that now held two of these files - reported:

```
  2 sessions read, 0 with records
  ...
  OpenCode: read, nothing found — read alone: no captured payload establishes that a hook or
  plugin sees OpenCode's own session id, so these figures cannot yet be joined to a run
  journal entry.
```

"2 sessions read" is the proof: the sweep discovered both OpenCode sessions from the journal
alone, exactly as it already does for every other tool, with nobody naming a session id by
hand. "0 with records" is expected and correct - no message was ever sent to either session
(that would have spent real budget), so `opencode export` legitimately has no counted
message to return; status `empty`, not `not-found`, meaning the export call itself
succeeded and simply found nothing to count. The stale `reason` text printed above is the
declaration this phase's own code change replaces (see below) - captured before that edit,
kept here verbatim because it is what the sweep actually printed at that moment.

The `turn-end` dispatch itself was checked too, free and directly: a synthetic
`{tool:"opencode", session_id, cwd}` payload matching an already-written `session_start`,
piped straight into `journal.js turn-end`, appended a `turn_end` line to that same run file -
proving the plumbing `hooks/opencode-plugin.js` drives from `session.idle` end to end. What
was not observed in this phase is OpenCode's own `session.idle` firing with a real id: it
fires only after a message the agent has processed, and no message was sent, on budget
grounds. It carries the identical `event` callback and an identically-shaped
`properties.sessionID` field per `@opencode-ai/plugin`'s own shipped types
(`EventSessionIdle`), delivered through the same mechanism `session.created` already proved
works - so the residual gap is narrow: not whether the dispatch works, but whether OpenCode
actually fires this one event the way its own types say it does. Named here as the one line
item in this phase not backed by its own live capture.

### What changed

- **`plugins/aidd-telemetry/hooks/opencode-plugin.js`** (new): the plugin module itself,
  ESM, as described above.
- **`plugins/aidd-telemetry/hooks/lib/host.js`**: `DECLARED_HOSTS` gains `"opencode"`, and
  `detectHost` gains one new branch (`payload.tool === "opencode"`), checked **last** -
  after every vendor-shape check, not before. No captured fixture from any other host
  carries a top-level `tool` key today (checked: `scripts/__tests__/fixtures/*.json`), but
  the ordering costs nothing and means a future vendor payload that happened to add one
  would still be claimed by its own shape first, never misattributed to OpenCode.
- **`plugins/aidd-telemetry/hooks/lib/record.js`**: `SESSION_ID_READER_BY_HOST.opencode`
  reads `payload.session_id` (the plugin's own payload already spells it that way);
  `VENDOR_FIELD_BY_HOST.opencode` is `null` - the same fact Cursor's entry already states,
  for the same reason: `opencode.ts`'s own `telemetryExport` is declared `"unmeasured"`
  (that is #653's probe, not this one), and a guessed OTEL attribute name here would be
  exactly the false figure this field exists to prevent.
- **`plugins/aidd-telemetry/hooks/lib/repo.js`**: `CWD_READER_BY_HOST.opencode` reads
  `payload.cwd` (same spelling as every host but Cursor).
- **`plugins/aidd-telemetry/skills/01-cost/scripts/lib/readers.js`** and its byte-parity
  copy at `plugins/aidd-telemetry/skills/02-check/scripts/lib/readers.js`:
  `capability.journalAttributable` flips from `false` to `true`, backed by the live sweep
  above; the stale `limitation` text (which described the pre-phase-5 state) is replaced by
  a comment naming this probe. Both copies confirmed byte-identical after the edit.
- **`scripts/__tests__/telemetry-cost-readers.test.js`**: the unreachable-tools assertion
  changes from `["opencode"]` to `[]`.
- **`scripts/__tests__/telemetry-check.test.js`**: two assertions tied to opencode's old,
  now-false declaration updated - the "healthy install" test no longer expects `"not
  covered: opencode"`, and the test built specifically to exercise `render.js`'s `limitation`
  fallback against a real (non-stubbed) declaration is removed, since opencode was the one
  declaration that fit it and no longer does; the synthetic stub test right beside it already
  covers the same code path and is untouched.
- **`cli/src/domain/tools/ai/opencode.ts`**: `telemetryJournalHost: "opencode"` added, and
  the stale `telemetryLocalRead.limitation` text removed - caught by
  `cli/tests/domain/tools/registry-conformance.unit.test.ts`'s two disagreement tests (the
  same pin the phase 4 addendum exercised for Cursor, in the opposite direction: there the
  plugin was wrong and reverted to match the CLI; here the plugin's new `true` is what the
  live sweep proved, and the CLI's stale `undefined` was what needed to catch up). Both
  tests pass after the edit; nothing needed changing on the plugin side a second time.

### Not changed, and why

- **`plugins/aidd-telemetry/hooks/lib/step-starts.js`** and **`file-writes.js`**: untouched,
  per the explicit instruction not to touch `step-starts.js`, and because this phase's scope
  is the two events named in the architecture projection - a session begins, a turn ends -
  not task-file attribution. `taskAttributable` stays `false` for OpenCode on both sides
  (plugin and CLI), consistent with `WRITTEN_PATH_EXTRACTOR_BY_HOST` never gaining an
  `opencode` entry.
- **The actual install route.** `cli/src/domain/capabilities/plugins-capability.ts` (off
  limits - another agent's Codex work), `cli/src/application/use-cases/plugin/**` (same),
  and `cli/src/application/use-cases/framework/strategies/tool-contracts.ts` (in scope, but
  not touched) all still produce the skip-and-warn behaviour issue #676 opens with -
  `translateFlat`'s `collectHooksSkips` still emits "hooks skipped for opencode" for any
  plugin, including this one, that ships a `hooks/` directory. Nothing installs
  `opencode-plugin.js` into a real project's `.opencode/plugin/` yet; every capture in this
  phase used a hand-copied file in a scratch project, exactly as the earlier phases probed
  before their own routes existed. Wiring `aidd framework build`/`aidd plugin add` to ship a
  *second* kind of artefact for OpenCode specifically (JS to be loaded, not JS to be
  executed - issue #676's own framing) is a new installation mode, scoped by that issue, not
  by this phase's architecture projection, and is left for whoever picks it up next.

### What `docs/telemetry-limits.md` should say

OpenCode's entry currently reads as one blanket statement about being unjoinable. It should
now separate three things phase 5 measured independently:

1. **The extension surface exists and the id is seen.** A JS module placed at
   `.opencode/plugin/*.js`, written as genuine ESM (OpenCode's loader does not run a
   CommonJS `module.exports` file - measured, not assumed, across three real sessions plus
   free reproduction), sees the session's own id on `session.created`'s `event.properties.
   info.id` - the same id `opencode export <id>` and the existing local-read reader already
   key on. A sweep of the run journal reaches an OpenCode session nobody named by hand.
2. **The reader was already correct; only the join was missing, and now isn't.** Local read
   (`opencode export --sanitize`) is unchanged and was never in question - it already
   reconciled token counters. `journalAttributable` is now `true`, on both the plugin's own
   `readers.js` and the CLI's `opencode.ts`, pinned to agree by
   `registry-conformance.unit.test.ts`.
3. **The framework does not install this yet.** The join above was proven with a
   hand-placed file, the same way Cursor's flat-hook route was proven before `cursor:flat`
   existed as a shipped target. `aidd framework build` still has no route that ships a
   loaded-not-executed JS module for OpenCode - it still emits the same "hooks skipped for
   opencode" warning it always has, for `hooks/opencode-plugin.js` exactly as for anything
   else under `hooks/`. Until that install mode exists, `journalAttributable: true` is a
   true statement about what the mechanism does when present, not about what a fresh
   `aidd plugin add` produces today.
4. **The plumbing for both lines is proven; only one of the two triggering events is.**
   `journal.js turn-end` was run directly, free, with a synthetic `{tool:"opencode",
   session_id, cwd}` payload matching one `session-start` had already written for, and it
   appended `turn_end` to that exact run file - the same dispatch `hooks/opencode-plugin.js`
   drives from `session.idle`. What was not captured is OpenCode's own `session.idle` firing
   with a real id: exercising it needs a billed message, on budget grounds. It shares the
   identical `event` callback and an identically-shaped `properties.sessionID` field
   (`@opencode-ai/plugin`'s own types) that `session.created` already proved delivers real
   data, so this is a small, named gap - the trigger, not the mechanism.
5. **A silent failure mode worth naming.** `hooks/opencode-plugin.js` spawns `node
   journal.js` and does not check the result - deliberately, matching journal.js's own "exit
   0 no matter what" contract (a measurement layer must not break a session). That means a
   plugin shipped without `journal.js` and `lib/` beside it, or run where `node` is not on
   `PATH`, journals nothing and reads identically to "no sessions ran" - the same silent
   failure that cost three of this phase's own iterations (a `process.execPath` bug that
   produced no error anywhere) before `--print-logs`'s own event log was used to catch it.
   Nothing to fix in the code for this alone; a consumer debugging "opencode never appears"
   needs to know journal.js's own exit code is not where that failure would show.

### Restoration

Everything scratch lived under `/private/tmp/.../scratchpad/opencode-probe` and
`/private/tmp/.../scratchpad/opencode-turnend-probe` - both removed after this phase. The
`turn-end` plumbing check above (Finding 4) used a synthetic id, `ses_turnend_test`, piped
directly into `hooks/journal.js` from a shell - not a real OpenCode session; called out here
so nothing in this document reads a synthetic id as a live capture.

One process was left over from the second billed session (a `opencode run` invocation
processing `--print-logs` through a piped `tail`, which never received the EOF a real
terminal would have sent it) and was still running, 22 minutes later, when this phase's
other work finished - found via `ps aux | grep opencode` during cleanup and killed. No other
`opencode` or `opencode serve` process was left running; every `serve` instance launched
during Findings 2 and 3 and the final proof was killed immediately after the capture it was
started for. `~/.opencode`, `~/.config/opencode`, and `~/Library/Application Support/
orca/opencode-hooks` were read from (to find the plugin type definitions and the one real
reference plugin already installed there) but never written to. Budget: 3 of 3 real sessions
used, all three spent before the extension surface's export-shape requirement was
understood; every capture after that point was free.

## Phase 6 — Cursor: hooks delivered where they fire, both modes closing a turn

### Budget

Two real `cursor-agent` invocations against the live API, of a budget of three. The third
was not used: both sessions were decisive and consistent with Phase 4's findings, and the
guidance was to diagnose before retrying, not to spend the budget confirming a clean result.

### Task 3, checked first: already done

`plugins/aidd-telemetry/hooks/lib/repo.js`'s `CWD_READER_BY_HOST` already carries
`cursor: (payload) => firstGitWorkspaceRoot(payload.workspace_roots)`, resolving the first
`workspace_roots` entry that is itself a git repository rather than assuming index zero -
landed via the `2026_08_20_step-boundaries` tree (`git log`: commit `7356c4ec`), covered by
`scripts/__tests__/aidd-telemetry-journal.test.js` (`"readCwd: every host but Cursor reads
payload.cwd directly; Cursor reads the first workspace_roots entry that is a git
repository"`, plus the multi-root and no-git-root cases). Zero lines changed for this task.

### Task 1: hooks now land in `.cursor/hooks.json`, not the plugin directory

Plugin-scope hooks were the only route the framework ever installed a Cursor hook through,
and Phase 4 measured that route firing nothing. Rather than guess a new plugin-scope fix,
this task moves the *destination*: `cursor.ts`'s `plugins` capability gained
`hooksDestination: "project"` (`cli/src/domain/capabilities/plugins-capability.ts`), a new
per-capability field distinct from `installScope` - skills, agents, commands and mcp are
untouched and still materialize under `~/.cursor/plugins/local/<plugin>/`, exactly as before.

`ModeBFlatMaterializationTranslator` (`cli/src/application/use-cases/plugin/translator/
mode-b-flat-materialization-translator.ts`) reads that field: when it is `"project"`, the
plugin's `hooks/` files are stripped out before the generic native translation runs
(`withoutHooks`), and a new side channel - `materializeProjectHooks`, mirroring the existing
`resolveMcp`/`mergeOpencodeMcpEntries` pattern for OpenCode's mcp merge - merges the plugin's
`hooks/hooks.json` into the project's own `.cursor/hooks.json` instead, via a new pure
module, `cli/src/domain/formats/cursor-hooks-project-merge.ts`. That module rewrites
`${CLAUDE_PLUGIN_ROOT}/hooks/<rel>` to `./.cursor/hooks/<plugin>/<rel>` (the same destination
`aidd framework build --target cursor --flat` already computes via `genericFlatHooksScriptPath`,
reused directly rather than re-derived) and then calls the existing `mergeCursorFlatHooks` -
so the install route and the framework-build route now produce byte-identical shapes through
one shared merge function. Hook scripts (`journal.js`, `lib/*`) are copied verbatim to
`.cursor/hooks/<plugin>/` alongside the manifest.

Hooks are deliberately **not** added to the plugin's `Plugin.files` record: that record is
join()'d against the plugin's own `baseDir` (`~/.cursor/plugins/local/<plugin>/`) by both
`writePluginFiles` and `plugin remove`'s `deleteOldFiles`, and a project-scope path doesn't
live there. `mcp.json` remains tracked as before.

Proof, from the real CLI (`aidd ai install cursor`, `aidd telemetry on --endpoint ... --yes`,
then `aidd plugin install <repo>/plugins/aidd-telemetry --tool cursor --scope user --yes`,
against a throwaway git-initialized project under `/private/tmp`):

```
.cursor/hooks.json:
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "node ./.cursor/hooks/aidd-telemetry/journal.js session-start" }],
    "stop":         [{ "command": "node ./.cursor/hooks/aidd-telemetry/journal.js turn-end" }],
    "sessionEnd":   [{ "command": "node ./.cursor/hooks/aidd-telemetry/journal.js turn-end" }],
    "postToolUse":  [{ "command": "node ./.cursor/hooks/aidd-telemetry/journal.js tool-used" }]
  }
}

.cursor/hooks/aidd-telemetry/: journal.js, lib/host.js, lib/step-starts.js, lib/file-writes.js,
  lib/record.js, lib/repo.js, opencode-plugin.js
```

`opencode-plugin.js` rides along: it sits beside `journal.js` under the plugin's own `hooks/`
today (another agent's in-flight, uncommitted work on this same tree), and the copy step -
matching `writeFlatHooksScripts` in the framework-build route, which has the identical
"everything under hooks/ but its own manifest" rule - carries it verbatim like every other
script. Unused by Cursor, harmless, not worth a special case for one file the shared route
already treats the same way.

`~/.cursor/plugins/local/aidd-telemetry/` after install: `skills/00-init/`, `skills/01-cost/`,
`skills/02-check/` only - no `hooks.json`, no `hooks/`. Nothing left in a directory Cursor
never reads.

**Declared, not built:** the marketplace-sourced install path
(`BuiltTreeMaterializationTranslator`, taken when `aidd plugin install <name>` names a
marketplace plugin rather than a local path) still copies from `builtDir/plugins/<name>/` -
still plugin-scoped, still unfixed. The proof above went through the local-source install,
the same command Phase 4 used and the one `docs/telemetry-limits.md` should describe; the
marketplace route is untouched, per the instruction not to restructure `installScope` or
`pluginsDir`, and is named here rather than silently left inconsistent. Likewise, `plugin
remove` does not yet unmerge a plugin's contribution out of `.cursor/hooks.json` or delete its
`.cursor/hooks/<plugin>/` scripts - removing the telemetry plugin today leaves both behind.
Neither gap is exercised by any acceptance criterion this phase was handed; both are flagged
for whoever picks up uninstall parity next, not fixed here.

### Task 2: which event closes a turn, in each mode - established by running both

Phase 4's addendum had one observation of each mode (interactive: `stop`, twice, from a
force-killed session; headless: `sessionEnd`, from a different, older probe in issue #680)
and said explicitly that one of each was not enough. This phase ran both fresh, through the
real install above, each project instrumented with an observer entry appended to every one of
Cursor's seven documented hook events (`sessionStart`, `beforeSubmitPrompt`, `preToolUse`,
`postToolUse`, `beforeReadFile`, `stop`, `sessionEnd`, `subagentStop`), each writing its own
name to a log file - alongside the installed `journal.js` commands, not replacing them.

**Headless** (`cursor-agent -p "..."  --force --trust`): fired `sessionStart`, `preToolUse`,
`beforeReadFile`, `postToolUse`, `sessionEnd`. Did **not** fire `stop`, `beforeSubmitPrompt`,
or `subagentStop`. Journal:

```
{"type":"session_start", ..., "run_id":"01M0M3WK6AYQCYEXKJCMAB30XA", ...}
{"type":"turn_end","at":"2026-08-22T06:52:51Z"}
```

One `turn_end` line, sourced from `sessionEnd` alone (`stop` never fired). Confirms, on a
current Cursor build (`2026.08.11-e8db854`) and the real production install path, what Phase
4 could previously only infer from an older probe.

**Interactive** (`expect`-driven pty, no `-p`, exited cleanly via `/exit` rather than being
force-killed): fired `sessionStart`, `beforeSubmitPrompt`, `preToolUse`, `beforeReadFile`,
`postToolUse`, `stop` - exactly once. Did **not** fire `sessionEnd` or `subagentStop`. Journal:

```
{"type":"session_start", ..., "run_id":"01M0M3XHZQD29SKP51C5RRMV2T", ...}
{"type":"turn_end","at":"2026-08-22T06:53:26Z"}
```

Again one `turn_end` line, this time sourced from `stop` alone. The double-`stop` seen in
Phase 4's addendum (`status: "error"` then `status: "aborted"`) came from that session being
torn down mid-shutdown, not from `stop` firing twice in the ordinary case - a clean `/exit`
here produced exactly one.

**Neither mode fired both events in this pass** - `stop` and `sessionEnd` are mode-exclusive
in every session observed to date, not merely likely to be. The design does not depend on
that holding forever, though: `CURSOR_EVENT_MAP` in `cli/src/domain/formats/
flat-hooks-merge.ts` now fans `Stop` out to `["stop", "sessionEnd"]` - both Cursor events
carry the identical `journal.js turn-end` command, so a session that fired both would simply
produce two `turn_end` lines, which `record.js`'s reader already tolerates (proven in Phase
4's addendum, two real `stop` firings, one run). No change to `journal.js` or
`HOOK_EVENT_NAME_TO_CANONICAL` was needed: the command's own argv (`turn-end`) is checked
before `hook_event_name` is ever consulted, so it makes no difference which of the two
Cursor spells the event.

`plugins/aidd-telemetry/hooks/hooks.json` (the shared source every host's build reads) was
**not** changed. Fanning out inside `CURSOR_EVENT_MAP` reuses the existing `Stop` source key;
adding a literal `SessionEnd` key there instead would have leaked into Claude's, Codex's, and
Copilot's own `--flat` build output too (`mergeClaudeSettingsHooks`, `mergeCodexFrameworkHooksJson`,
and `flattenCopilotHooksShape` all copy every key through undiscriminated), handing three
hosts that have no such event a dead hook entry - exactly the "a tool's own vocabulary...
never leaking into a shared shape" decision this plan already committed to.

### Repeat-install duplication, named rather than hit by accident

`mergeCursorFlatHooks` appends; it has no notion of "this plugin already contributed this
entry" the way `mergeOpencodeMcp` does by key. Installing the same plugin twice into one
project without removing it first would double every command in `.cursor/hooks.json`. Both
proof sessions above used a fresh `/private/tmp` project with exactly one install each, and a
`cat .cursor/hooks.json` right after install (shown above) confirmed one entry per event
before either session ran. Not exercised by this phase's acceptance criteria; named as a gap
for the same uninstall-parity follow-up as the marketplace-route and `plugin remove` gaps above.

### What `docs/telemetry-limits.md` should say about Cursor

The journal route is no longer uncovered. Replace "Cursor's plugin-scope hook... was never
observed firing" with: installing the telemetry plugin for Cursor through `aidd plugin
install <path> --tool cursor --scope user` (the local-source route; the marketplace-sourced
route is not yet fixed, see Task 1 above) now delivers hooks into the project's own
`.cursor/hooks.json` - the destination measured, across both Phase 4 and this phase, to
actually fire - rather than the plugin-scope directory Cursor's native install writes
everything else to. A real interactive session and a real headless session both produced a
run file naming Cursor's own conversation id and exactly one `turn_end` line: interactive
sessions close the turn on `stop`, headless sessions close it on `sessionEnd`, and the
install subscribes to both so neither mode is silently unmeasured. Local read and export
remain uncovered for the reasons already stated in that section (Cursor writes no token count
in any file it produces; export is an Enterprise team setting nobody here can turn on) -
unchanged by this phase, journaling and reading are independent capabilities and only the
first moved.

### Restoration

`aidd ai install cursor`, `aidd telemetry on`, and `aidd plugin install ... --tool cursor
--scope user --yes` were run against two throwaway projects under `/private/tmp` (git-
initialized, nothing pre-existing to preserve) - not restored, per the established pattern
that scratch under `/private/tmp` needs no cleanup. Outside the repo, both installs wrote to
the real `~/.cursor/plugins/local/aidd-telemetry/`, freshly created by this phase (Phase 4's
own probe had already removed it at the end of that phase); removed after this phase's proof
was captured. `aidd-context`, `aidd-dev`, `aidd-orchestrator`, `aidd-pm`, `aidd-refine`,
`aidd-test`, `aidd-ui`, `aidd-vcs` in that same directory are pre-existing on this machine,
untouched by this phase. No `cursor-agent` process was left running. Budget: 2 of 3 real
sessions used.

## Phase 7 — delivery: what was proven by hand, an install now produces

### Budget

Two real `opencode run` invocations against the live API, of a budget of two - both spent on
provider/model resolution failures before either reached a model call, so neither is real
spend in the billing sense, but both are real spend against the session budget and neither
settled the question they were meant to. Zero `cursor-agent` sessions: Task 2 and Task 3 are
about *where an install writes*, provable by running the real `aidd` CLI and reading the
filesystem - the question of whether Cursor's hooks fire once installed there was already
settled, twice, in Phases 4 and 6.

1. `opencode run` against a fresh scratch `$HOME` with no provider config: silently defaulted
   to `opencode/big-pickle`, a free hosted tier, and hit `FreeUsageLimitError` (HTTP 429) on
   every retry for several minutes before being killed. Not this repo's bug - a probe
   environment gap (no model specified, no config to default it) - but it consumed real
   session-budget time without ever reaching the code under test.
2. `opencode run -m anthropic/claude-haiku-4-5-20251001` against the real `$HOME` (copying
   the real `auth.json`'s Anthropic OAuth alone was not enough - `opencode models` still
   listed only free tiers even under the real `$HOME`, and every explicit `anthropic/...`
   model id drawn from `~/.cache/opencode/models.json` - `claude-sonnet-4-5`,
   `claude-haiku-4-5-20251001` - came back `Model not found`, a provider/catalog mismatch
   this session could not resolve.

Per the guidance to diagnose before retrying and to report an exhausted budget rather than
keep guessing: this is named as a real gap below, not papered over.

### Task 1: OpenCode gets a runtime it can load, delivered - proven by installing for real

`PluginsCapability`'s `FlatPluginsParams` gained a `FlatHooksSupport` union
(`cli/src/domain/capabilities/plugins-capability.ts`), mirroring native mode's own
`HooksSupport`: `{acceptsHooks: true, flatHooksDir}` or `{acceptsHooks: false,
hooksUnsupportedReason}`. `opencode.ts` now declares the first: `acceptsHooks: true,
flatHooksDir: ".opencode/plugin/"` - the exact directory OpenCode's loader scans
(`{plugin,plugins}/*.{ts,js}`, non-recursive, measured in Phase 5).
`PluginContentTranslator.translateFlat` (`plugin-content-translator.ts`) gained
`flatHooksFiles`: every file under a plugin's `hooks/` but its own `hooks.json` manifest -
the manifest describes a shape OpenCode never reads - is carried verbatim into
`flatHooksDir`, the same "carry the script, translate the prose" rule native mode already
follows. `collectHooksSkips` needed no change: it already reads `acceptsHooks` off the
capability, so a tool that now accepts hooks stops emitting a skip without any conditional
being touched.

Proof, from the real CLI (`aidd ai install opencode`, `aidd plugin install
<repo>/plugins/aidd-telemetry --tool opencode --scope project --yes`, against a throwaway
git-initialized project under `/private/tmp`):

```
.opencode/plugin/: journal.js, opencode-plugin.js, lib/host.js, lib/step-starts.js,
  lib/file-writes.js, lib/record.js, lib/repo.js
```

No `hooks.json`. No skip warning printed (`plugin install` emitted none). Matches exactly
what `docs/telemetry-limits.md` should now say the OpenCode install route delivers - the same
directory, the same files, the hand-placed proof from Phase 5 turned into what a fresh
install produces.

**A real bug, found only by running it, not by reading it.** `opencode-plugin.js`'s
`runJournal` passed `JOURNAL_SCRIPT` - a `URL` object built with `new URL("./journal.js",
import.meta.url)` - directly into `spawnSync("node", [JOURNAL_SCRIPT, event], ...)`. Node
stringifies a non-string argv element, giving `"file:///.../journal.js"` - and `node
<that string>` is **not** a valid script invocation: Node's CLI resolves a bare path
argument as a CommonJS specifier relative to its own `cwd`, not as a `file://` URL, so the
spawned process died with `MODULE_NOT_FOUND` on a mangled path
(`<cwd>/file:/.../journal.js`, one slash swallowed by path normalization) - silently, every
time, because `journal.js`'s own "exit 0 no matter what" contract means `runJournal` never
checks `spawnSync`'s result. Direct invocation of `journal.js` by its real path always
worked (which is how Phase 5's own "Finding 4" free proof of the `turn-end` plumbing passed
- it piped a synthetic payload straight into `journal.js` by path, never through
`opencode-plugin.js`'s own `runJournal`, so this bug had no test surface until a real
delivered file was actually run). Fixed with `fileURLToPath`. A new regression test,
`scripts/__tests__/opencode-plugin.test.js`, imports the delivered file as ESM, calls
`AiddTelemetry` with a synthetic `session.created` then `session.idle` event, and asserts a
`session_start` then `turn_end` line - confirmed to fail on the unfixed code (reverted and
re-ran by hand) and pass on the fix.

**What is proven, and what is not.** The delivery is proven: the right files land in the
right place, with no skip warning, via the real CLI. The plugin's own dispatch plumbing is
proven, directly: calling `AiddTelemetry`'s returned `event` handler with a synthetic
`session.created` then `session.idle` event correctly spawns `journal.js` and writes both
lines. **What is not proven: that OpenCode's own live process actually calls that handler**,
end to end, without anything synthetic in the loop. Three independent free probes (`opencode
serve` + a direct `curl -X POST /session`, matching Phase 5's own technique exactly - once in
a project with competing plugins, once in a project isolated to a single probe file replicated
verbatim from Phase 5's own successful capture) all showed the plugin's module loaded and its
exported function *called* (confirmed via a synchronous `fs.appendFileSync` at the top of the
returned `event` callback), but the callback was never invoked for `session.created`,
`session.updated`, or any bus event that followed - across two sessions created on the same
long-running server, not merely a first-event race. This contradicts Phase 5's own "Finding
2" capture of the identical event under the identical technique.

Reading the installed `opencode` binary's own decompiled plugin-loading code
(`strings`/manual trace, not guessed) shows the mechanism *should* work: loaded plugins are
pushed into an array `W` before a `subscribeAll()` wildcard listener is forked
(`$.subscribeAll().pipe(N1.runForEach((j)=>{for(let D of W)D.event?.({event:j})}),
L.forkScoped)`), and the log ordering confirms that fork happens before any session activity.
The one structural detail that fits the observation and that this session could not verify
directly: `forkScoped` ties the listener's lifetime to a *scope*, and if that scope belongs
to the bootstrapping HTTP request (or to the app instance only while a client stays
connected) rather than to the server process itself, a bare `POST /session` with no
persistently-connected client could have its listener torn down with nothing ever having
had the chance to deliver an event through it - which a genuine `opencode run` (a real,
a real, persistently-connected session) would not exhibit, since the client stays attached for the run's
duration. This is a plausible, bytecode-grounded theory, not a confirmed one: settling it
needs exactly the real, connected session this phase's budget could not complete (see
Budget above). Named here, not asserted as fixed, and not silently dropped.

**What `docs/telemetry-limits.md` should say**, updated for this: the framework now installs
`hooks/opencode-plugin.js` (with `journal.js` and `lib/` beside it) into `.opencode/plugin/`
via `aidd plugin install --tool opencode` - the "framework does not install this yet" line
from Phase 5 is no longer true and should go. What should replace it: the delivery is
proven; the plugin's own dispatch code is proven directly; whether OpenCode's live event bus
actually reaches an installed plugin's handler in an ordinary run is *not yet proven by a
live session* - Phase 5's own capture of this exact thing is now in question, not confirmed,
pending a session with a persistently-connected client (a real `opencode run`, not a bare
`curl POST /session`).

### Task 2: a marketplace install does what a local one does - proven by installing for real

`ModeBFlatMaterializationTranslator`'s `materializeProjectHooks` logic moved into a new
shared class, `ProjectHooksMaterializer`
(`cli/src/application/use-cases/plugin/translator/project-hooks-materializer.ts`), along with
the `withoutHooks` helper that strips `hooks/` from a `PluginDistribution` before the generic
native translator sees it. `BuiltTreeMaterializationTranslator` - the marketplace-sourced
route, taken when `aidd plugin install <name> --from <marketplace>` resolves a registered
marketplace - now calls the same `ProjectHooksMaterializer.materialize` on the *original*
`PluginDistribution` (not the built tree, which still ships hooks/hooks.json plugin-scoped -
the marketplace build never learned the project-scope route exists, and fixing that build
target was not this task) when the tool's own capability declares `hooksDestination ===
"project"`, and strips `<name>/hooks/` out of the built-tree files it copies into the
plugin-scoped directory. Both routes call the identical function on the identical input;
neither route derives the destination itself.

Proof, from the real CLI against a throwaway project under `/private/tmp`: a scratch
marketplace (`.claude-plugin/marketplace.json` naming `aidd-telemetry` by a relative
`./plugins/aidd-telemetry` source, matching the schema `assets/schemas/claude-marketplace-
manifest.json` requires - `name`, `owner`, and each plugin's `source` as a *string*, not the
`{kind,path}` object shape some other install routes accept), registered with `aidd
marketplace add`, then `aidd plugin install aidd-telemetry --from telemetry-market --tool
cursor --scope user --yes`:

```
.cursor/hooks.json: sessionStart, stop, sessionEnd, postToolUse - one entry each, commands
  naming .cursor/hooks/aidd-telemetry/journal.js
.cursor/hooks/aidd-telemetry/: journal.js, opencode-plugin.js, lib/*
~/.cursor/plugins/local/aidd-telemetry/: skills/ only - no hooks.json, no hooks/
```

Byte-for-byte the same destination Phase 6 proved for the local-source route. The disagreement
test the task asked for:
`cli/tests/application/use-cases/plugin/translator/install-plugin-cursor-marketplace-hooks
.integration.test.ts`, `"both routes write to the destination cursor.ts declares"` - installs
via `ModeBFlatMaterializationTranslator` and via `BuiltTreeMaterializationTranslator`
independently, reads the destination `.cursor/hooks.json` path from `cursor.ts`'s own
`hooksDestination` field rather than hard-coding it, and asserts both routes wrote there and
neither wrote a `hooks`-containing path under the plugin-scoped directory. Reading the
declaration rather than comparing the two routes to each other is deliberate: two routes
regressing to plugin scope *together* would still pass a route-vs-route-only comparison,
which is exactly the shape of drift issue #698 already produced once.

### Task 3: undo what an install did - proven by installing and removing for real

**Dedup, at merge time.** `mergeCursorProjectHooksJson`
(`cli/src/domain/formats/cursor-hooks-project-merge.ts`) now strips a plugin's own prior
contribution before merging its fresh one - `stripPluginHookEntries`, matched by a
plugin-unique marker (`.cursor/hooks/<plugin>/`, which every command this route ever writes
already contains, since scripts land under that exact path). Landed in the install-time
wrapper, not in `mergeCursorFlatHooks` itself, which the phase text names as the culprit:
`mergeCursorFlatHooks` is also what `aidd framework build --target cursor --flat` calls, and
a fresh build writing to a fresh `outDir` every run has no repeat-accumulation exposure to
fix - only the install route, which merges into a *persistent* project file across separate
invocations, does. Also rejected: an `mcpEntries`-style tracked-contribution map (the pattern
`mergeOpencodeMcp` uses). MCP server names carry no plugin identity of their own, so that
tracking is load-bearing there; every Cursor hook command this route writes already embeds
its owning plugin's name in its own path, making a second, persisted "what did I contribute
last time" record redundant.

**Unmerge, on remove.** `unmergeCursorProjectHooksJson` (same file) strips one plugin's
entries with the identical marker and no other input - `PluginRemoveUseCase.removeProjectHooks`
(`plugin-remove-use-case.ts`) calls it for every tool whose `PluginsCapability` declares
`hooksDestination === "project"`, then deletes `.cursor/hooks/<plugin>/` outright
(`cursorProjectHooksScriptDir`, a new export). Both destinations are recomputed from
`pluginName` alone - no new field on `Plugin`/`Manifest` was needed, because the destination
was always deterministic from the name, the same fact the dedup marker above already relies
on.

Proof, from the real CLI, same scratch project as Task 2, extended to two plugins
(`aidd-telemetry` and `aidd-context`, both shipping `hooks/`) installed side by side:

```
after both installed:  .cursor/hooks.json sessionStart has two entries (aidd-telemetry,
  aidd-context); .cursor/hooks/ has both plugins' own subdirectories
aidd plugin remove aidd-telemetry --tool cursor:
  .cursor/hooks.json sessionStart now has exactly aidd-context's entry - aidd-telemetry's
    is gone, aidd-context's is untouched
  .cursor/hooks/aidd-telemetry/ is gone; .cursor/hooks/aidd-context/ still exists
  ~/.cursor/plugins/local/aidd-telemetry/ is gone entirely (mcp.json/skills, tracked in
    Plugin.files as before)
```

A plain repeat `aidd plugin install aidd-telemetry ...` (no `--replace`, no prior remove)
throws `DuplicatePluginError` before reaching any translator - the manifest layer already
refuses a second install by name, for every route, not something this phase changed. The
real, CLI-reachable "install twice" path is `plugin remove` then `plugin install` again -
proven above, one copy, because remove already cleared the old one before the new merge ran.
The path the dedup logic itself exists for - `PluginAddUseCase`'s internal `replace: true`
(used by `aidd setup`'s idempotent re-run, not exposed as a `plugin install` flag) merging a
second time *without* an intervening remove - is proven by running the actual production
`ModeBFlatMaterializationTranslator.addPlugin` twice against one manifest (with the manifest
entry dropped, not the filesystem, between calls - exactly what `replace: true` does):
`remove-plugin-cursor-hooks-mcp.integration.test.ts`, `"installing the same plugin twice
leaves one copy in .cursor/hooks.json"`. This is real production code executing on each call,
not a hand-derived read of the merge function, but it is not a CLI-level repro - `aidd
setup`'s specific re-run flow was not separately exercised end to end within this phase's
budget.

### What `docs/telemetry-limits.md` should say, updated for this section

Cursor's journal-route entry (Phase 6) should drop "the marketplace-sourced route is not yet
fixed" - both routes now agree, proven above. Nothing in the local-read or export sections
changes; this phase moved delivery and removal only.

### Restoration

**Repo-external state.** `~/.cursor/plugins/local/` outside the repo was never touched -
every Cursor CLI invocation in this phase ran with `HOME` pointed at a scratch directory
under `/private/tmp`, confirmed after the fact (`ls ~/.cursor/plugins/local/` still shows
only the same pre-existing plugins Phase 4/6 listed, untouched). OpenCode's install proof
also ran under a scratch `$HOME` for the delivery check. The two failed `opencode run`
sessions (Budget, above) ran against the *real* `$HOME` after the scratch one turned out not
to carry enough provider configuration to resolve a model - this wrote at most a stale
session row into `~/.local/share/opencode/opencode.db` pointing at a since-deleted `/private/
tmp` project (normal residue of ordinary `opencode` use on this machine, not cleaned
separately) and read, never wrote, `~/.local/share/opencode/auth.json`. No `opencode` or
`cursor-agent` process was left running (checked via `ps aux` after each phase of testing).
Everything else - both scratch projects, the scratch marketplace, the scratch `$HOME`
directories - lived under `/private/tmp` and was removed after this phase's proofs were
captured.

**In-repo.** `plugins/aidd-telemetry/hooks/opencode-plugin.js` gained the `fileURLToPath` fix
described above (a real, load-bearing bug fix, not a probe artifact) and stays. Budget: 2 of 2
`opencode run` sessions used, neither reaching a model call (see Budget); 0 of an unbudgeted-
but-unneeded `cursor-agent` allowance used, per the instruction that Tasks 2 and 3 needed
filesystem inspection after a real CLI run, not a live Cursor session.


## Adjudication — why phases 5 and 7 disagreed about OpenCode, and what is true

Phase 5 captured the plugin's `event` handler receiving `session.created`. Phase 7 ran three
probes, one replicating phase 5 verbatim, and the handler was never invoked. Both reports are
accurate about what their author observed, and the reason is a property of OpenCode nobody had
named.

Reproduced here with the production plugin instrumented to record two moments — when its module
is loaded, and when its factory is called:

```
$ opencode serve --port 39918          # after boot
(no trace)

$ curl -X POST /session                # first session
MODULE_LOADED
FACTORY_CALLED ["client","project","worktree","directory","experimental_workspace","serverUrl","$"]
    -> no run file

$ curl -X POST /session                # second session
    -> aidd_docs/runs/01M0M767…__ses_fd78ce10fffeDAwyK6AVv1i24h.jsonl
       {"type":"session_start","tool":"opencode","vendor_id":"ses_fd78ce10fffeDAwyK6AVv1i24h"}
```

**The plugin is loaded lazily, by the very request that creates the first session.** Nothing is
loaded at server boot. So `session.created` for that first session is published before a handler
exists to receive it, and it is missed — silently, since nothing failed. Every session after it,
in the same server process, journals correctly.

That reconciles the two reports exactly. Phase 5 read two sessions from its sweep, so at least one
of them came after the plugin was live. Phase 7 started a fresh server for each probe and only ever
observed the first session of each.

### What follows

`journalAttributable: true` stands: a sweep does reach OpenCode sessions nobody named by hand, which
is what the flag promises. The limitation is narrower and needs saying plainly: **the first session
of a server process is not journalled.** It is not a race that a retry fixes — the handler does not
exist yet — and there is no session identifier in what the factory is handed, so the plugin cannot
recover it from inside.

One smaller thing the same capture shows: the OpenCode journal line carries `vendor_field: null`
where every other tool names the field its identifier came from. Worth a line of its own.
