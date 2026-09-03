# Telemetry system challenge — 2026-08-28

Adversarial review of the whole AIDD telemetry system on `claude/aidd-telemetry-layer-e403uf`.
Not a diff review. The question is whether it serves a real person and whether every claim
it makes is true.

**Method.** Everything below was run, not read, except where marked "source read". The CLI was
exercised as `cli/dist/cli.js` under a sandboxed `HOME` and a sandboxed `AIDD_USER_CONFIG_DIR`,
in a throwaway git repository outside the framework checkout. No source file was modified.
The real `~/.config/aidd/` holds no `identity.json` and no `person-mapping.json`.

**Verdict.** The measurement engine is honest. All three documented double-count rules hold
under direct attack, the stored record allowlist is real, and the `--json` envelope matches its
contract. The failures are at the edges the engine does not control: **consent, the health
check, and the presentation layer.** The system is also roughly three times the size its one
question needs.

Score: **6.5 / 10**. Correct arithmetic, dishonest perimeter.

> **Classification note.** `/aidd-refine:02-challenge` was named in the brief. This report uses
> the brief's own requested split — *this is false* / *this is missing* / *this is over-built*,
> with a ranked table and a score — rather than that skill's deal-breaker / suggestion / correct
> taxonomy. The two do not merge cleanly, and the brief's split is the more useful one here
> because the central question was about truthfulness, which the skill's taxonomy has no bucket
> for. Every finding below carries the command and output that proves it, which is the standard
> either format demands.

---

## Part 0 — What is true (verified, not assumed)

Stated first because the case against the system is only credible if the case for it is stated
accurately.

| Claim | Verdict | Proof |
| --- | --- | --- |
| "No prompt, no code, no diff. The stored shape is an allowlist" | **TRUE** | Key-dump of all 34 real records in `~/.config/aidd/telemetry/*.jsonl`: 20 distinct keys, all scalar, no free text. See §0.1 |
| Re-read is idempotent | **TRUE** | `read` twice → `(2 new of 2)` then `(0 new of 2)`. §0.2 |
| Third double-count rule ("one billed call, seen by both routes") applied by `report` | **TRUE** | Two records, same `tool`+`vendor_id`+`billed_request_id`, different `turn_id`, one `export` + one `local-read`, 100+100 tokens each → report prints **200 tokens, 1 request**. §0.3 |
| `kind: "session"` never summed into `kind: "request"` | **TRUE** | Claude `request` 1000 + Claude `session` 1000 → report prints **1,000 tokens, 1 request**. §0.3 |
| Journal-interval attribution works | **TRUE** | A transcript line with no `attributionSkill`, timestamped inside a `step_start`/`turn_end` window, stored as `step_attribution: "journal-interval"`. §0.4 |
| Identity file refuses `AIDD_USER_CONFIG_DIR` | **TRUE** | `resolveAiddConfigDir()` (`cli/src/infrastructure/home-dir.ts:37`) reads only `HOME`/`APPDATA`; `identity on` wrote to `$HOME/.config/aidd/identity.json` with `AIDD_USER_CONFIG_DIR` pointing elsewhere. |
| `off` stops recording and keeps history | **TRUE** | After `off`, a `session-start` hook wrote no journal file; `report` still printed the prior 4,695 tokens. |
| `identity link` is disclosed as unverifiable | **TRUE** | The command itself prints `This is a declaration the tool cannot check - it never verifies who is running it.` |
| `endpoint` warns about the email and gates project scope | **TRUE** | Both outputs quoted in F1 and F3 below. |
| `--json` matches `cost-report-contract.md` | **TRUE** | Top-level key set identical to the contract's documented shape (`cost_report_version`, `period`, `sessions`, `totals`, `by_step`, `by_model`, `by_tool`, `by_project`, `by_day`, `by_person`, `attribution`, `read`). |

### §0.1 Allowlist verification

```
$ cd ~/.config/aidd/telemetry && cat *.jsonl | node -e "…collect all key paths…"
cache_creation_tokens  cache_read_tokens  effort  event_timestamp  input_tokens
kind  model  output_tokens  project_field  project_id  provenance  sink_schema_version
step  step_attribution  step_plugin  tool  turn_field  turn_id  vendor_field  vendor_id
```

Flat, 20 keys, no nesting, no free text. The claim holds on real data.

### §0.2 Idempotency

```
=== READ #1 ===   Claude Code: read (2 new of 2)
=== READ #2 ===   Claude Code: read (0 new of 2)
```

### §0.3 Double-count rules under attack

```
=== RULE 3: one billed call, both routes (true total = 200) ===
  sessions 1   requests 1   tokens 200

=== KIND MIX: claude request 1000 + claude session 1000 (true = 1000) ===
  sessions 1   requests 1   tokens 1,000
```

Both collapse correctly. The arithmetic is the strongest part of this system.

### §0.4 Journal-interval attribution

```json
{"kind":"request","turn_id":"req_X","step_attribution":"journal-interval","step":"aidd-dev:02-implement",
 "input_tokens":1000,"output_tokens":2000,…}
```

---

## Part 0.5 — The real journey: the first three commands, verbatim

Someone installs the framework and wants to know what their work cost. They have not read the
plugin README. In a fresh repository, this is what happens.

**1. `aidd telemetry report`** — the obvious first guess, and the one the `01-cost` skill maps to.

```
period    2026-08-22 to 2026-08-28

  sessions                  0
  requests                  nothing in this period

  by tool
    Claude Code               nothing in this period
    Cursor                    not covered — It writes no token count in any file it produces.
    GitHub Copilot            nothing in this period — Its own file names outputTokens per turn, …
    OpenCode                  nothing in this period — Its four counters are measured correct for …
    Codex                     nothing in this period

  by day
    2026-08-22                nothing in this period
    … (seven rows)
EXIT=0
```

Twenty lines, exit 0, and **not one word saying measurement was never turned on**. The user's
reasonable reading is "I spent nothing" or "this is broken". See M3.

**2. `aidd telemetry check`** — if they think to try it.

```
  measurement is off — nothing to check until it is turned on
```

One correct line. It does not name the command that would turn it on. The user must now guess
`aidd telemetry on`, find the plugin README, or ask an agent.

**3. `aidd telemetry read`** — the other guess.

```
  No session journalled yet — nothing to read.
```

Also correct, also silent about the switch and about `on`.

**Then they run `aidd telemetry on`** — and are not told the file they just wrote is committed
and will measure everyone who clones (F1). They work for a while, and run `check` again:

```
  hook fired            FAIL  this session left no run file — the newest one is from 2026-08-28T11:15:29Z
  session journalled    ok    2 of 2 run file(s) carry more than session_start
  tool files readable   ok    claude: 2 of 2 session(s) read; copilot: 0 of 2 …
  records join          ok    2 of 3 record(s) joined a step, 1 unattributed
  export configured     FAIL  CLAUDE_CODE_ENABLE_TELEMETRY=1 and OTEL_EXPORTER_OTLP_ENDPOINT are not set, …
  identifier joinable   --    no export configured to join a record from - see export configured
```

Everything works. `read` and `report` produce correct figures. The health check says **FAIL,
twice**. See M2.

**Where they get stuck, in order:** no first-run guidance (M3); no discoverable path from
"nothing here" to `telemetry on`; a health check that fails a healthy system and implies the
fix is to configure an export (M2); a headline number that silently spans every project on the
machine (M4); and a `by step` table that shows the same skill twice with no explanation
(Part 4).

---

## Part 1 — THIS IS FALSE

Ranked by how likely a user is to act on the false statement.

### F1 — `telemetry on` turns measurement on for everyone who clones, with no gate and no warning. The command that does far less demands `--yes`.

The strongest finding in the set, because both halves are one command each and the project has
already written the correct reasoning down — in the wrong place.

```
$ aidd telemetry endpoint https://collector.example.com --scope project
Error: --scope project writes the git-tracked …/.claude/settings.json,
turning telemetry on for everyone who clones. Pass --yes to confirm.
EXIT=1
```

```
$ aidd telemetry on
AIDD telemetry switch -> …/newproj/.aidd/config.json
AIDD telemetry: on.
Added aidd_docs/runs/ to .gitignore — the journal names who worked on what and for how long.
Delete that line to commit it instead.
AIDD telemetry: on (…/newproj/.aidd/config.json)
EXIT=0
```

`.aidd/config.json` is **deliberately committed** — `.gitignore` un-ignores it on purpose
("tracked so a fresh clone inherits the project's decision"). So `telemetry on` has exactly
the consequence `endpoint --scope project` refuses to have without `--yes`, and it ships with
no confirmation, no `--yes`, and no sentence telling the user that the file they just wrote is
tracked. The one warning it does print is about the *journal*, not the *switch*.

Verified end to end:

```
$ git add .aidd/config.json .gitignore && git commit -m "enable telemetry"
$ git clone newproj cloned && cd cloned
$ cat .aidd/config.json          →  {"telemetry":{"enabled":true}}
$ echo '<SessionStart payload>' | node journal.cjs session-start
   (no output — silent)
$ cat aidd_docs/runs/*.jsonl
{"type":"session_start","project_id":"cloned","project_remote":"…/newproj","tool":"claude-code",…}
```

The cloner is measured from their first session, silently, having been asked nothing.

**Checked and clear — the endpoint URL is not committed.** `TelemetrySwitch` carries an optional
`endpoint` (`telemetry-switch.ts:12`), `parseTelemetrySwitchFile` reads it, and
`buildTelemetrySwitchFile` would write it into the tracked `.aidd/config.json`. If `aidd telemetry
endpoint` wrote there, F1 would escalate to "one person commits a remote collector URL that every
cloner inherits, with `user.email` on the wire". It does not:

```
$ aidd telemetry endpoint https://collector.example.com && cat .aidd/config.json
{ "telemetry": { "enabled": true } }
```

The endpoint goes to each tool's own settings file instead. But `on` and `off` both read and
preserve `switch.endpoint` (`telemetry-on-use-case.ts:80`, `telemetry-off-use-case.ts:48`) for a
field nothing ever writes — dead surface today, and a live escalation path the moment anything
does write it. A hand-edited committed `.aidd/config.json` carrying an endpoint would be parsed
and preserved.

**Also duplicated output**: `on` prints its state twice ("AIDD telemetry: on." then
"AIDD telemetry: on (path)"). `off` does the same. Cosmetic, but it is the first thing a new
user sees.

### F2 — Root `README.md`: "nothing leaves your machine" — unqualified, and false.

`README.md:293`:

> Answers what a piece of work cost — tokens, models, and which skill spent them. Off unless
> you turn it on, and nothing leaves your machine.

Two false statements in one sentence.

**"Nothing leaves your machine"** — `aidd telemetry endpoint <url>` arms every installed tool
to export OTLP to any host. What leaves carries an email address. The code knows this
(`cli/src/domain/models/telemetry-switch.ts:44-48`), the captured fixture proves it, and the
command itself says so:

```
$ grep -o '"user\.[a-z_]*"' cli/tests/fixtures/telemetry-sink/otlp-logs-claude-code.json | sort -u
"user.account_id"  "user.account_uuid"  "user.email"  "user.id"

$ aidd telemetry endpoint https://collector.example.com
Warning: Telemetry endpoint … is not on this machine. What a tool exports carries an email
address; sending it there is a choice you just made by typing it.
```

The plugin README qualifies the claim ("unless you point it somewhere yourself"). The root
README — the file every new user reads first, and the file this project has already shipped a
false privacy claim in once — does not.

**"Off unless you turn it on"** — false for anyone who clones a repository where someone else
turned it on. For them it is *on unless they turn it off*, and there is no way for them to turn
it off (see M1).

### F3 — `aidd_docs/runs/README.md` documents four journal line types. The hook writes seven.

The table headed "Every line carries `at` and `type`" lists `session_start`, `turn_end`,
`file_written`, `task_declared`. The code writes three more:

```
$ grep -n 'type: "' plugins/aidd-telemetry/hooks/lib/*.cjs
file-writes.cjs:182:  return { type: "scan_truncated", at, cap, scanned };
record.cjs:139:    type: "session_start",
record.cjs:155:  const line = { type: "turn_end", at };
record.cjs:169:  return { type: "file_written", at, path: writtenPath, source };
record.cjs:177:  const line = { type: "step_start", at, skill: sanitizeSkillName(skill) };
record.cjs:189:  return { type: "task_declared", at, path: declaredPath };
record.cjs:268:  const line = `${JSON.stringify({ type: "unrecognised_payload", at: nowIso() })}\n`;
```

The missing one that matters is **`step_start`** — the line that carries the skill name, the
mechanism the entire product pitch rests on ("None can tell you that `aidd-dev:02-implement`
spent 78,188 of them"). Observed live in a journal this review produced:

```json
{"type":"step_start","at":"2026-08-28T11:15:06Z","skill":"aidd-dev:02-implement","turn_id":"p1"}
```

The document that exists specifically to say "what the journal records, and what it
deliberately does not" omits the record that makes the product differentiated. A reader
auditing what lands in their repository from this file would not know skill names are in it.

### F4 — "The journal names who worked on what and for how long." It names nobody.

Stated twice: in `aidd telemetry on`'s console output, and in `plugins/aidd-telemetry/README.md`
("It records who worked on what, for how long, and every file each session wrote — nothing
else").

No line builder in the hooks carries any identity field. `grep` over the whole hooks tree finds
`USERNAME`/`USERDOMAIN` only inside `restrictToCurrentUser`, an `icacls` call on Windows —
never written to a record. A real `session_start` line:

```json
{"type":"session_start","at":"…","schema_version":2,"run_id":"01M14…","project_id":"newproj",
 "project_remote":null,"tool":"claude-code","vendor_id":"aaaa…","vendor_field":"session.id"}
```

This over-states risk rather than hiding it, which is the safer direction to be wrong in — but
it is still false in the two places a user reads before deciding, and it misdirects the audit.
The real exposure is a *different* one: `project_remote` (the full remote URL),
repository-relative paths of every file written into a task folder, skill names, and per-second
timings. Someone who reads "names who worked on what" and finds no names may conclude the file
is safe to commit — which the same message actively invites ("Delete that line to commit it
instead").

### F5 — `home-dir.ts` justifies its Windows correctness by pointing at a deleted script and a test that does not exist.

`cli/src/infrastructure/home-dir.ts:13-18`:

> This is the same rule the plugin's own `skills/01-cost/scripts/lib/readers.cjs` (`homeDir`) and
> `skills/00-init/scripts/lib/identity.cjs` apply. […] otherwise the two sides answer different
> questions on Windows while looking identical on POSIX (see `telemetry-plugin-matches-cli.e2e.test.ts`).

```
$ ls plugins/aidd-telemetry/skills/00-init/scripts   → No such file or directory
$ ls plugins/aidd-telemetry/skills/01-cost/scripts   → No such file or directory
$ find cli scripts -name 'telemetry-plugin-matches-cli*' | wc -l   → 0
```

Both scripts were deleted (`person-identity-adapter.ts:15` admits it) and the named guard test
does not exist anywhere in the repository. The "two sides must agree" invariant this comment
describes now has one side and no test. Four sites carry the stale reference:
`home-dir.ts:13,14`, `deps.ts:748`, `person-identity-adapter.ts:69`.

Same class of staleness elsewhere: `.gitignore:44` and `aidd_docs/runs/README.md:3` both point
at `plugins/aidd-telemetry/hooks/journal.js` (the file is `journal.cjs`); `repo.cjs:254` cites
`telemetry-switch.js on`, a command that does not exist.

### F6 — The `01-cost` skill talks about a script it does not have.

The skills "carry no scripts" — confirmed, there is no `scripts/` directory under any of them.
Seven sites in `01-cost` say otherwise:

```
SKILL.md:23   | locate  | find the script and check the switch |
SKILL.md:44   - Report what the script printed.
SKILL.md:47   - The script cannot be found or fails: say so and show no figure.
actions/03-report.md:3,15,24,79  "ask the script for that…", "exactly as the script wrote it"
```

This is instruction text an agent reads and acts on. An agent told to "find the script" and to
stop if "the script cannot be found" is being pointed at a thing that was removed.

### F7 — `aidd_docs/runs/README.md`: "cloning the repository never carries anyone's session history."

Stated as an unconditional guarantee. It is conditional on the enabler having committed the
`.gitignore` line — and `aidd telemetry on` explicitly invites deleting it ("Delete that line to
commit it instead"). A guarantee the same feature offers you a one-line way to falsify is not a
guarantee.

Related, and unverified in this review: **the premise that issue #297 / `metrics-contract.md`
record a "No SaaS" decision could not be confirmed.** `grep -ri "saas"` over `aidd_docs`,
`docs`, `plugins`, and `README.md` returns only `aidd-context:01-bootstrap` hits; `#297` appears
nowhere. I could not locate that decision of record, so I have not reasoned from it. Treat the
over-build finding in Part 3 as standing on its own evidence.

---

## Part 2 — THIS IS MISSING

### M1 — There is no refusal. Anywhere.

The hook reads exactly one thing:

```
plugins/aidd-telemetry/hooks/lib/repo.cjs:109  path.join(repoRoot, ".aidd", "config.json")
plugins/aidd-telemetry/hooks/lib/repo.cjs:116  function telemetryEnabled(repoRoot)
```

Every environment variable the hooks read:

```
$ grep -rn "process\.env\." plugins/aidd-telemetry/hooks/ | sed 's/.*env\.\([A-Z_]*\).*/\1/' | sort -u
AIDD_RUNS_DIR
USERDOMAIN
USERNAME
```

`AIDD_RUNS_DIR` relocates the journal; it does not disable it. There is no user-scope config, no
machine-scope config, no `AIDD_TELEMETRY=0`. A contributor who does not consent has exactly
three options: dirty a tracked file, uninstall the plugin, or accept being measured. Every one of
those is worse than a one-line env var.

This is the known gap, and it is worth restating only because of its interaction with F1: the
system has a committed opt-**in** that one person can set for everyone, and no opt-**out** at any
scope. That asymmetry, not the missing `status` command, is the consent defect.

### M2 — `aidd telemetry check` reports FAIL on a demonstrably working install.

Not "before anything ran". This is `check` in a project where two sessions were journalled, both
were read, three records were stored and two joined a step, and `report` prints correct figures:

```
$ ls aidd_docs/runs/
01M1418DZGZRJG0DPF8G6VCG4N__aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl
01M1419YRSKVTNGAQ6FGPVC5EP__11111111-2222-3333-4444-555555555555.jsonl

$ aidd telemetry check
  hook fired            FAIL  this session left no run file — the newest one is from 2026-08-28T11:15:29Z
  session journalled    ok    2 of 2 run file(s) carry more than session_start
  tool files readable   ok    claude: 2 of 2 session(s) read; copilot: 0 of 2 session(s) read; …
  records join          ok    2 of 3 record(s) joined a step, 1 unattributed
  export configured     FAIL  CLAUDE_CODE_ENABLE_TELEMETRY=1 and OTEL_EXPORTER_OTLP_ENDPOINT are
                              not set, across …/.claude/settings.local.json, …/.claude/settings.json,
                              …/sandhome/.claude/settings.json
  identifier joinable   --    no export configured to join a record from - see export configured
  not covered: cursor   --    It writes no token count in any file it produces.
```

Three `ok`, **two FAIL**, one `--`. The chain works end to end and the diagnostic grades it a
third failed.

**`export configured FAIL` is the unconditional one, and the serious one.** Two of the six claims
grade the **OTLP export route**, which the shipped, documented, working path does not use at all.
`read` joins the journal to the tool's own transcript; it needs no export, no endpoint, and no
collector. A user who "doubts a figure" is told by `02-check` to run this, and by `02-check`'s own
transversal rule to relay **every** line. The remedy the FAIL implies is `aidd telemetry endpoint`
— the one route that sends `user.email` off the machine. A health check that fails healthy
systems and points at the privacy-degrading option is worse than no health check.

**`hook fired FAIL` is conditional, and still wrong often enough to matter.** It grades whether
*the current session* left a run file, resolved from `CLAUDE_CODE_SESSION_ID` / `CODEX_THREAD_ID`
(`cli/src/domain/models/session-anchor.ts:19`). Run from inside a Claude Code session with the
plugin installed, it can pass. Run from a plain terminal — no anchor, no session — it can only
ever FAIL, whatever the state of the chain. The claim is named "hook fired" but measures "this
process is inside a journalled AI session", and nothing in the output says so.

The `02-check` skill amplifies this: *"Present every printed line. A line this skill leaves out is
a claim the user cannot check."* So the agent is instructed to relay a FAIL that means nothing is
wrong. The remedy a user will infer from `export configured FAIL` is `aidd telemetry endpoint` —
the privacy-degrading action, recommended by a health check, for a system that is healthy.

This is the single worst user-facing defect in the system.

### M3 — `aidd telemetry report` never says measurement is off, and shows `0` where the design forbids zeros.

A brand-new user's first command:

```
$ aidd telemetry report
period    2026-08-22 to 2026-08-28

  sessions                  0
  requests                  nothing in this period
  by tool
    Claude Code               nothing in this period
  …
EXIT=0
```

`check` knows the state (`measurement is off — nothing to check until it is turned on`).
`report` does not consult it. A user who has never enabled telemetry gets a clean, complete,
exit-0 report of nothing, with no indication that nothing was ever measured — the exact
"a session that was never measured reads as free" failure the codebase names in
`read-local-cost-use-case.ts:36` and designs against everywhere else.

And `sessions 0` is a literal zero, on the same screen where `requests` correctly prints
`nothing in this period`. The plugin README's governing rule — *"an absent figure is named,
never shown as a zero"* — is broken by the first line of its own flagship output.

### M4 — Nothing tells the user the report is machine-wide.

`report` run inside project A reports every project on the machine. Standing in `newproj` with
a sink copied from real work:

```
  tokens                    1,665,458    91% cache
  by project    of tokens
    no known project           59%   974,995 tokens
    aidd-telemetry-demo        26%   440,451 tokens
    project                    15%   250,012 tokens
```

This is deliberate and documented (`cost-report-contract.md`: "never folded into a project the
reader happens to be standing in"), and it is the right default for a per-person sink. But the
headline figure a person reads — `tokens 1,665,458` — is cross-project, and no line of the text
report says so. Someone asking "what did my work on this repo cost" reads a number that includes
every other repo they touched. The `by project` breakdown is four screens down.

### M5 — `project_id` collides, and the report groups on it.

```
plugins/aidd-telemetry/hooks/lib/repo.cjs / cli/src/domain/models/telemetry-project-id.ts
```

With a git remote, `project_id` is `owner/repo` — fine. With no remote, it falls back to the
directory basename. The real sink on this machine contains a project literally called
`project`, and my throwaway repo produced `newproj`. Two unrelated checkouts in directories of
the same name merge into one report row, silently. For a single user this is cosmetic. For the
shared-sink deployment the plugin README actively recommends ("Point `AIDD_USER_CONFIG_DIR` at a
directory a team shares"), it is a correctness bug: two teammates' unrelated `project`
directories become one row with no way to tell them apart.

### M6 — On this machine, the flagship feature has never produced a number for real work.

All 34 real records in `~/.config/aidd/telemetry/`:

```
kind              {"request":33,"session":1}
step_attribution  {"unattributed":17,"tool-stated":17}   ← journal-interval: 0
project_id        {"undefined":18,"project":8,"aidd-telemetry-demo":8}
```

Zero journal-interval attributions. Zero records naming the framework's own repository
(`ai-driven-dev/framework`). Every record with a project came from a demo or scratch directory.
And this checkout has no `.aidd/config.json` at all — telemetry is **off in the repository that
built it**. The mechanism works (I proved it in §0.4), but it has never been carried by real
work. "Proven end to end on Claude Code" is true of the code path and not of the practice.

---

## Part 3 — THIS IS OVER-BUILT

### O1 — Three commands are reachable by no skill and documented in no user-facing place.

Every `aidd telemetry` invocation across all three skills:

```
$ grep -rhno "aidd telemetry [a-z]* *[a-z]*" plugins/aidd-telemetry/skills/ | …
   4 aidd telemetry report      4 aidd telemetry on         4 aidd telemetry check
   3 aidd telemetry identity    2 aidd telemetry read       2 aidd telemetry off
   + identity status/on/off/use/name/link/unlink
```

Never invoked: **`receive`**, **`endpoint`**, **`endpoint clear`**.

```
$ grep -rn "telemetry receive\|telemetry endpoint" plugins/ docs/ README.md aidd_docs/product/
plugins/aidd-telemetry/README.md:14   … `aidd telemetry endpoint` — which nothing else turns on.
plugins/aidd-telemetry/README.md:137  `aidd telemetry endpoint <url>`, which arms your tools …
plugins/aidd-telemetry/README.md:138  … `aidd telemetry endpoint clear` undoes it.
```

`aidd telemetry receive` — an OTLP/HTTP server that binds :4318 — appears in **no** user-facing
document. Its only mention anywhere is inside `endpoint`'s own output: *"Run `aidd telemetry
receive` to capture what is exported — without it, nothing is stored."* The two commands are a
closed loop that only references itself.

**What they buy.** They ingest the same records the local `read` path already produces, into the
same sink, with `provenance: "export"` instead of `"local-read"`. The one thing the export route
adds is `cost_usd` — and the plugin README's own Coverage section says *"No amount, anywhere […]
turning tokens into money is a separate service's job."* So the OTLP half exists to feed a
pricing service that does not exist, while being the only route that carries `user.email`, the
only route with a retried-delivery double-count hazard (`metrics-contract.md`: "a retried
delivery for it is indistinguishable from two real calls"), and a third of what `check` grades.

**Delete:** `receive`, `endpoint`, `endpoint clear`, the OTLP receiver, the export-config
reader/writer, the two export claims in `check`, and the `provenance: "export"` branch of the
sink. That removes 3 of 17 commands, the machine's only network listener, the only PII egress
path, and the two FAILs in M2 — and costs nothing any documented workflow uses.

### O2 — 12,447 lines and 1,082 lines of contract to answer one question.

```
$ find cli/src -name '*.ts' | xargs grep -l -iE "telemetry|cost-report|run-journal|session-cost|otlp" | wc -l
70
$ … | xargs wc -l | tail -1
12447 total
$ find cli/tests -iname '*telemetry*' -o -iname '*cost*' -o -iname '*journal*' | wc -l
55
$ wc -l aidd_docs/product/metrics-contract.md aidd_docs/product/cost-report-contract.md
733 + 349 = 1082
```

Plus a zero-dependency hooks package (7 `.cjs` modules), 3 skills with 11 action files, and 2
plugin READMEs. The product surface a user touches is: turn it on, ask what it cost. Much of the
volume is genuinely load-bearing (five tool formats, three double-count rules that I verified
hold) — but `metrics-contract.md` is written "for a consumer outside this repository — a pricing
service, an aggregator" that does not exist, and its most elaborate sections (the third
double-count rule, `billed_request_id` grouping, retried OTLP delivery) exist entirely to serve
the export route O1 argues for deleting.

### O3 — 7 identity subcommands for a feature that has attached a person to zero real records.

`status`, `on`, `use`, `off`, `name`, `link`, `unlink`. No record in the real sink carries a
`person_id`. `use` (adopt an identifier minted elsewhere) and `link`/`unlink` (fold another
identifier into yours) only matter in a shared-sink deployment, which is a documented option
nobody is running. `link` is also the one operation the CLI admits it cannot verify:

```
$ aidd telemetry identity link colleague-uuid-1234
AIDD identity: linked 'colleague-uuid-1234' to dc747fc4-…
  This is a declaration the tool cannot check - it never verifies who is running it.

$ aidd telemetry report --axis person
| dc747fc4-… | dc747fc4-…, colleague-uuid-1234 | amount unknown — 1,000,000 tokens, 1 requests |
```

A colleague's million tokens folded into my row on my say-so. The disclosure is honest and the
behavior is documented, so this is not a lie — but shipping the claim-and-merge machinery ahead
of any deployment that needs it is three commands (`use`, `link`, `unlink`) of speculative
generality carrying a real misattribution hazard.

---

## Part 4 — The numbers: can a person get a wrong figure and not know it?

Yes — once, and it is a presentation bug, not an arithmetic one.

All three double-count rules survive direct attack (§0.3). `--step` gets the combined total
right. `--json` is contract-conformant. The defect is `--axis`, the flag whose entire purpose is
*"Print one axis as a table to paste elsewhere"*:

```
$ aidd telemetry report --axis step
| Step | Total |
| --- | --- |
| aidd-dev:02-implement | amount unknown — 3,000 tokens, 1 requests |
| unattributed          | amount unknown — 1,130 tokens, 1 requests |
| aidd-dev:02-implement | amount unknown —   565 tokens, 1 requests |
```

The same step, twice, with two different numbers and **nothing on the row explaining why**. The
`attribution` field — the only thing that makes two rows for one step intelligible, and which
`cost-report-contract.md` explicitly names as the second key of `by_step` ("one skill reached
once from the tool's own statement and once from a journal interval is two rows, because they are
two different claims") — is dropped from the rendered table.

A person pastes this into a report. A reader sees a duplicated row and picks the larger number:
**3,000**. The true figure is **3,565**, which `--step aidd-dev:02-implement` prints correctly and
this table never shows. The paste-ready artifact is the one that loses the disambiguating column.

The plugin README's own worked example has the identical defect:

```
  by step    of tokens
    aidd-ui:01-hello           67%   78,188 tokens    stated by the tool
    aidd-ui:01-hello           33%   38,490 tokens    from a journal interval
```

Here the attribution suffix *is* present, so it is merely confusing rather than wrong — but the
step's real total (116,678, 100%) appears nowhere, and the headline it sums to is the whole
session's.

**Fix:** add an `Attribution` column to `--axis step`, and add a per-step subtotal row.

---

## Part 5 — The second user / second platform

**The premise in the brief is stale.** Issue #707's claim that nothing has ever run on Windows or
Linux is contradicted by `.github/workflows/cli-ci.yml`:

- Every job except one is `ubuntu-latest`, including the full unit / integration / e2e suites.
- `cli-ci.yml:178-260` is a real `windows-latest` job that: writes `.aidd/config.json` by hand
  with no CLI installed, replays a captured payload through `journal.cjs`, asserts the journal
  stays private and `git add -A` still works, runs the plugin suite, does a **real global
  `npm install -g` of the packed tarball**, then runs `aidd --version` and `aidd telemetry check`
  off the PATH, then `test:unit`, `test:integration`, and the e2e project.

The real gaps are narrower and worth stating precisely:

1. **`shell: bash` is declared for the whole Windows job.** Every command runs under Git Bash.
   PowerShell and `cmd.exe` — what a Windows user without Git Bash actually has — are untested.
   The job's own comment concedes the hazard for `pnpm` scripts (`cmd.exe` would break
   `$(node -p …)`), then works around it rather than covering it.
2. **`telemetry-multi-tool.e2e.test.ts` is excluded on Windows** (`cli-ci.yml:260`), because it
   installs a `#!/bin/sh` stand-in binary. That is the only test exercising three readable tools
   through one report — so the multi-tool join is Linux/macOS-verified only.
3. **`icacls` is the Windows privacy mechanism** (`repo.cjs:217-243`) and its exit code is
   deliberately not trusted. Under a domain policy that refuses the ACL reset, the journal is
   left world-readable and the code says nothing — the `catch` is empty by design. On POSIX the
   equivalent path is a `chmod` whose failure is likewise swallowed. On both platforms, "the
   journal stays private" can fail silently.
4. **macOS is where `~/.config/aidd` is wrong by convention** — the plugin README documents the
   `%APPDATA%` split for Windows but keeps `.config` on macOS, where the platform convention is
   `~/Library/Application Support`. Defensible, undocumented as a decision.

---

## Ranked summary

| # | Finding | Class | Severity |
| --- | --- | --- | --- |
| F1 | `telemetry on` is ungated; `endpoint --scope project` demands `--yes` for the same consequence | False / consent | **Critical** |
| M2 | `check` reports 2 FAIL of 6 on a proven-working install; the remedy it implies is the PII egress route | Missing | **Critical** |
| F2 | Root README: unqualified "nothing leaves your machine" and "off unless you turn it on" | False | **High** |
| M1 | No opt-out at any scope; no env kill switch | Missing | **High** |
| F3 | `runs/README.md` omits `step_start` from its complete list of line types | False | **High** |
| P4 | `--axis step` drops the attribution column; paste-ready table is the wrong one | Numbers | **High** |
| M3 | `report` never says measurement is off; prints `sessions 0` against its own no-zeros rule | Missing | **Medium** |
| O1 | `receive` / `endpoint` / `endpoint clear`: no skill calls them, `receive` documented nowhere | Over-built | **Medium** |
| F4 | "The journal names who worked on what" — it names nobody; misdirects the audit | False | **Medium** |
| M4 | Report is machine-wide and never says so | Missing | **Medium** |
| F5 | `home-dir.ts` cites two deleted scripts and a nonexistent guard test | False | **Medium** |
| F6 | `01-cost` skill instructs an agent to find a script that was deleted | False | **Medium** |
| M5 | `project_id` collides on directory basename; breaks the shared-sink deployment | Missing | **Medium** |
| M6 | Zero journal-interval attributions and zero real-project records on the only machine it ran on | Missing | **Medium** |
| O2 | 12,447 LOC + 1,082 lines of contract for one question | Over-built | **Low** |
| O3 | 7 identity verbs, 0 records carrying a person | Over-built | **Low** |
| F7 | "cloning never carries anyone's session history" — a guarantee the feature offers to falsify | False | **Low** |
| — | Stale `.js`/`journal.js`/`telemetry-switch.js` paths in `.gitignore`, `runs/README.md`, `repo.cjs` | False | **Low** |
| — | `TelemetrySwitch.endpoint` read and preserved by `on`/`off`, written by nothing — dead surface on the tracked file | Over-built | **Low** |
| — | `on` and `off` each print their state twice | Polish | **Low** |
| P5 | Windows job is bash-only; multi-tool e2e excluded there; `icacls`/`chmod` failures silent | Platform | **Low** |

## The three changes that buy the most

1. **Gate `telemetry on` the way `endpoint --scope project` is gated.** Same warning text, same
   `--yes`. The correct sentence is already written in the codebase.
2. **Delete the export half** (O1). It removes the two false FAILs in `check`, the only network
   listener, and the only path that sends an email address anywhere.
3. **Add an env kill switch** (`AIDD_TELEMETRY=0`, read by `telemetryEnabled` in `repo.cjs`).
   One line. It is the difference between a committed opt-in and a committed mandate.

---

*Read-only review. No source file modified; `git status --porcelain` clean of source changes.
All CLI runs used a sandboxed `HOME` and `AIDD_USER_CONFIG_DIR`; the real `~/.config/aidd/`
holds no `identity.json` and no `person-mapping.json`.*
