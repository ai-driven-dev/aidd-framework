# Is the core actually there? — a capture matrix

**Scope.** Branch `claude/aidd-telemetry-layer-e403uf`, HEAD `c10c2222`. Read-only audit.
Five AI tools × six dimensions (tokens, model, skill/step, task, person, project), each cell
graded on four independent axes.

**The four axes.**

- **Captured** — the reader extracts it. Graded from the source line, never a doc comment.
- **Tested** — a test asserts the *value*. A test asserting the reader exited 0 is not a
  test of the value, and is graded as such throughout.
- **Validated** — the test runs against a **real captured artifact** from that tool.
- **Normalised** — it lands in `aidd_docs/product/metrics-contract.md`'s record shape with
  the *same meaning* across tools.

**Verdict up front.** The core is largely there and unusually well evidenced — 1683 unit +
integration tests, 192 journal tests, 27 telemetry e2e tests, all passing, zero skipped on
this platform. The token and model readers are real captures with by-value assertions and
mutation guards. The weaknesses are not in whether the values are extracted; they are in
**normalisation**, and they are concentrated in two cells that a consumer cannot see from
the record or the declaration.

### Score: 82 / 100

No validator defines weights for this audit, so the score is the proportion of the 120 cells
fulfilled, adjusted for severity. The reasoning, stated so it can be argued with:

- **Base.** Of 120 cells, 24 are `n/a` — a tool that genuinely cannot emit a dimension is not
  a failure, and the codebase's own `not-covered` handling makes that a first-class answer
  rather than a zero. Of the 96 live cells, roughly 76 are full, 14 partial, 6 absent-and-
  correctly-declared. That is about **86%** on a straight proportion.
- **Downward, −4 for N-1 (Copilot × tokens × normalised).** Not a hard violation — nothing is
  known to be wrong — but an undeclared inclusivity assumption on the largest counter, on the
  one readable tool with no e2e, is the failure mode this whole layer exists to prevent. It is
  the difference between a limit that is measured and one that is assumed.
- **Downward, −2 for N-2 (OpenCode × model × normalised).** A genuine docs-versus-code
  contradiction in a contract written for an external consumer. Small because the code's
  reasoning is sound and the fix is one paragraph of text.
- **No further deduction for N-3** (Copilot/Cursor steps recorded but unattributable): the
  consequence is stated in the contract, even if the connection to the journal is not drawn.
- **No deduction for the synthetic task/project payloads.** They are a real evidence gap and
  are ranked in §2, but every one of them has a passing by-value assertion behind it and the
  captures needed to close them already exist in the repository.

The pass threshold is the caller's to set; this is the measurement, not a verdict on it.

---

## Fixture provenance — what "real" means, per tool

This is the axis most likely to be weaker than it looks, so it is settled first. Two fixture
trees matter, and they carry different weight.

| Fixture | Tool | Real capture? | Source & date | Notes |
| --- | --- | --- | --- | --- |
| `cli/tests/fixtures/local-cost/.claude/projects/fake-project/2222…jsonl` (+ `subagents/agent-aa81cdef3bb58820c.jsonl`) | Claude Code | **Yes** | Claude Code 2.1.229 / 2.1.232, measured 2026-08-20 (`claude-code-transcript.ts:8-12`) | Redacted: prompts → `[REDACTED]`, session id substituted. Shape untouched. |
| `cli/tests/fixtures/local-cost/.codex/sessions/2026/07/{16,29}/rollout-*.jsonl` | Codex | **Yes** | Codex CLI 0.145.0-alpha.27, measured 2026-08-20 (`codex-rollout.ts:8-13`) | Two rollouts: a fresh session and its resumed child. `session_meta.id ≠ session_id` on the resumed one is **real capture, not a copy-paste artifact** — it is the exact condition `CODEX_ROLLOUT_LOCATION` exists to handle, and is pinned by a test. |
| `cli/tests/fixtures/local-cost/.copilot/session-state/3333…/events.jsonl` | Copilot | **Yes** | `@github/copilot@1.0.80`, measured 2026-08-21/22 (`copilot-events.ts:3-4`) | Carries real internal shapes (`totalNanoAiu: 2655750000`, `copilotVersion: "1.0.80"`). The sibling `4444…` fixture is a genuine zero-usage session. |
| `cli/tests/fixtures/telemetry-sink/opencode-export.json` | OpenCode | **Yes** | `opencode export --sanitize`, opencode 1.14.20, 2026-08-20 (`opencode-export.unit.test.ts:8-9`), mechanically trimmed to `{info, messages:[{info},…]}` | The `[redacted:session-directory:…]` markers are genuine `--sanitize` output; the capture is real and is loaded directly by the mapper's own unit test (`:19`, `:118`, `:124`) and by the route-supply guard (`telemetry-route-supply.unit.test.ts:96`). Two weaker points, both structural rather than about authenticity: it is the **only counter fixture living outside `local-cost/`**, so it does not sit in the mirrored-`$HOME` layout the other three do; and the adapter that would open it in production shells out to `opencode export`, so the *adapter* path is exercised against a stand-in rather than this file. Separately, the payload's `info.version` reads `"1.2.24"` — what that field denotes (session record, export schema, or CLI) is **not established here**, so it is recorded as an observation, not a contradiction. |
| `scripts/__tests__/fixtures/*-session-start.json`, `*-post-tool-use-skill*.json`, `cursor-*`, `codex-*`, `copilot-compat-*` | all 4 journal hosts | **Yes** | `out-*-skill` probe runs, issue #663 comment 2026-08-20; Copilot compat shapes 2026-08-22 and 2026-08-28 against `@github/copilot@1.0.80` | `scripts/__tests__/fixtures/README.md` states the capture provenance per file and the exact two-kind redaction (email → `user@example.com`, absolute paths → `/home/user/...`). These are recordings; the README says so explicitly and the codebase honours it. |
| Cursor | — | **No counter fixture exists, and none can** | Probed: Cursor writes no token count in any file (`cursor.ts:139-143`) | Cursor's hook payloads *are* real captures; its cost files do not exist. |

**The per-dimension fixture split is not uniform, and this is the single most important
nuance in the whole audit.** Three different grades sit under "the journal tests use real
fixtures":

- **step** — real captures, per host, **value-asserted**. `stepPayload()` loads
  `STEP_FIXTURE_BY_HOST[host]` (`aidd-telemetry-journal.test.js:2904-2909`) and the loop at
  `:2981-2997` asserts `steps[0].skill === "probe-echo"` for all four hosts. The compat
  shape gets its own test asserting `"00-init"` (`:2999-3016`).
- **task** — **hand-written input**, value-asserted. `readTaskPayload()`
  (`:3344-3386`) builds one payload per host by hand; the test's own comment says "One shape
  per host". The assertion (`declared[0].path === TASK_RELATIVE_PATH`) is real; the input is
  not a capture.
- **project** — value assertions run on `makePayload()` (a hand-built Claude Code shape:
  `:1002-1003`, `:2398-2399`, `:2434`). The real per-host `*-session-start.json` fixtures are
  replayed only for `status === 0 && stdout === "" && stderr === ""` (`:2277-2290`) — that is
  a test the reader ran, not a test of the value.

---

## The matrix

Grades: **F** = full, **P** = partial, **✗** = not present, **n/a** = not applicable.

### Dimension 1 — tokens

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code | **F** — `claude-code-transcript.ts:73-86`, `:152-155`; all four or none | **F** — `claude-code-transcript.unit.test.ts` "yields one record per real assistant turn, by value, under the stored field names"; "turns red rather than storing a zero when a counter field is renamed" | **F** — real transcript + subagent file | **F** — `input_tokens` exclusive of cache; the reference convention every other reader is normalised *to* |
| Codex | **F** — `codex-rollout.ts:96-109`, sums `last_token_usage`, never the cumulative | **F** — 8 by-value tests incl. "yields one record per turn, its counters summed from the increments, never the totals"; "counts it once, because a cumulative that has not moved was never billed" | **F** — two real rollouts | **F** — `:102` subtracts `cached_input_tokens` to match Claude's exclusive convention; `reasoning_output_tokens` correctly *not* added to output |
| Copilot | **F** — `copilot-events.ts:66-79` | **F** — `copilot-events.unit.test.ts` "yields one kind: session record, from session.shutdown's own tokenDetails"; "never reads modelMetrics.usage.inputTokens, which is inclusive of the cache figure" | **F** — real `events.jsonl` | **P** — see finding **N-1**. Granularity difference (whole-session total under `kind: "session"`) *is* documented; the input/cache-read exclusivity assumption is not, and is unproven by the only capture. |
| OpenCode | **F** — `opencode-export.ts:91-107` | **F** — 7 by-value tests incl. "yields no record for a message OpenCode created but never billed — no total, even though tokens is present and every counter reads 0" | **F** — the main by-value test loads the real capture directly (`opencode-export.unit.test.ts:19`); edge-case tests use inline payloads, which is the right split | **P** — exclusivity measured only for providerID `anthropic`; **declared** as a limitation (`opencode.ts:190-193`) and documented in the contract's per-tool row |
| Cursor | **✗** | **F** (of the absence) — `cursor.unit.test.ts`; `read-local-cost-use-case.unit.test.ts` "reports a tool with no declared local read as not-covered, with its declared reason" | **F** — the probe is the measurement | **n/a** — `not-covered` is a first-class report value, never a zero |

### Dimension 2 — model

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code | **F** — `claude-code-transcript.ts:127` (`message.model`) | **F** — by-value test; plus `<synthetic>` filter tests ("yields no record for a message the tool marked `<synthetic>`") | **F** — fixture carries `claude-opus-5` | **F** — bare model id, unmodified |
| Codex | **F** — `codex-rollout.ts:89`, from `turn_context` not the counted event | **F** — "carries the model and effort from turn_context, not from the counted event" | **F** — `gpt-5.5`, `gpt-5.6-sol` | **F** — bare model id, unmodified |
| Copilot | **✗ by design** — deliberately never stamped (`copilot-events.ts:14-17`): `currentModel` names the session's *last* model, and `session.model_change` is a real captured event | **F** (of the absence) — "never names a model — currentModel is only ever the session's last model" | **F** — the fixture's `modelMetrics` is keyed per model, proving the ambiguity is real | **F** — absence is correct; a model row for a multi-model session would be a fabrication |
| OpenCode | **F** — `opencode-export.ts:129` (`info.modelID`) | **F** — "yields one record per billed message, by value, under the stored field names" | **F** — same real capture, loaded directly | **✗** — see finding **N-2**. `providerID` is deliberately stripped (`:11-14`); the contract's Field reference says `model` is "the model identifier the tool itself used, **unmodified**" (`metrics-contract.md:563`) and the word "provider" appears nowhere in the contract. |
| Cursor | **✗** | **n/a** | **n/a** | **n/a** — no local read at all. Cursor's *hook* payload does carry a `model` field, but nothing reads it into a record. |

### Dimension 3 — skill / step

Step is three-way (`step-attribution.ts:9`): `tool-stated` > `journal-interval` >
`unattributed`. The two sources mean genuinely different things and the contract says so
(`metrics-contract.md`, "Step attribution").

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code | **F, both routes** — tool-stated at `claude-code-transcript.ts:131-132` (`attributionSkill` + `attributionPlugin`); journal `step_start` via `tools/claude-code.cjs:25-33` | **F** — `read-local-cost-use-case.unit.test.ts` "stores a tool-stated step, marked as stated by the tool"; "carries a tool-stated plugin alongside its step"; "prefers the tool's own stated step over a journal interval that also covers it" | **F** — subagent fixture carries `attributionSkill`; journal side replays the real `claude-code-post-tool-use-skill.json` and asserts the skill name | **F** — the only tool supplying `tool-stated`. The difference from every other tool is declared (`supplies.toolStatedStep: true`, `claude.ts:135`) and documented. |
| Codex | **P** — journal-interval only. `supplies.toolStatedStep: false` (`codex.ts:274`); `step_start` from a SKILL.md path in a `Bash` command (`tools/codex.cjs:47`) | **F** — journal test asserts the skill name from the real capture; `step-attribution.unit.test.ts` 9 by-value tests on the interval logic | **F** — real `codex-post-tool-use-skill-read.json` | **P** — `step` is present, but it is an *inference from a time interval*, not a measurement. Declared and documented. |
| Copilot | **P** — journal-interval only, on both payload shapes (`tools/copilot.cjs:16-36`) | **F** — journal test asserts `"probe-echo"` (canonical) and `"00-init"` (compat), both from real captures | **F** — both shapes are real captures | **✗ in effect** — see finding **N-3**. Copilot's local read yields exactly **one whole-session record**, so no interval can ever place an amount inside a step. The journal writes step lines nothing can attribute cost to. |
| OpenCode | **✗** — `stepStart: null` (`tools/opencode.cjs:16`); the plugin observes only session lifecycle events, never a tool call. `supplies.toolStatedStep: false` (`opencode.ts:180`) | **F** (of the absence) — `STEP_START_BY_HOST` is derived from the declarations, so OpenCode is structurally absent; "reads a record as unattributed when neither the tool nor a journal can say" | **F** — declared, with a stated reason | **F** — always `unattributed`; documented in the contract's per-tool row |
| Cursor | **P** — journal `step_start` works (`tools/cursor.cjs:27`) | **F** — journal test asserts `"probe-echo"` from `cursor-post-tool-use-skill-read.json` | **F** — real capture | **✗ in effect** — the journal records the step; there is no cost record to attribute to it |

### Dimension 4 — task

Task is never on a record. It is derived at read time from two journal line kinds
(`task-attribution.ts`, `task-identity.ts`), by design — the contract's "Attributing records
to a task" explains why a frozen conclusion is worse than a re-runnable derivation.

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code | **F, both routes** — `file_written` (the only host with a readable written path: `tools/claude-code.cjs:13-18`) **and** `task_declared` | **F** — journal test asserts the declared path; `cost-report.unit.test.ts` 5 by-value tests under "a task is a filter over a period" and 5 more under "a task can be declared, not just derived" | **P** — the real `claude-code-post-tool-use-{write,edit,notebook-edit}.json` are replayed **status-only**; the value test uses a mirror payload, and `readTaskPayload` is hand-written | **F** — the stated-path route is exact where a declaration is inferred; `statedAsWrittenAlready` (`task-declared.cjs:48-52`) prevents the two firing on one event |
| Codex | **P** — declared route only; `writtenPath: null` (`tools/codex.cjs:48`), writes go through an `apply_patch` string | **F** — journal test asserts the path | **F** — real, live capture (`codex-cli 0.151.0`), 2026-08-31; see `scripts/__tests__/fixtures/README.md`, "The task-declaration payloads" | **P** — a declaration is an interval, not a whole-session fact; documented |
| Copilot | **P** — declared route only (`writtenPath: null`), reading `toolArgs` as plain text | **F** — journal test asserts the path; plus "declaredTaskPath reads tool_input first and Copilot's toolArgs string only when tool_input is absent" | **✗** — hand-written payload | **P** — same as Codex |
| OpenCode | **P** — declared route, `telemetryTaskAttributable: true` (`opencode.ts:205`). Settled by measurement, not assumed: a completed tool part's own arguments do reach the plugin's `event` hook, and `hooks/opencode-plugin.js` joins one into a declaration the same way every other host's hook does. | **F** — `aidd-telemetry-opencode-payloads.test.js` asserts the declared path from a genuine captured tool part | **F** — the call the plugin builds from a genuinely captured event (`opencode-tool-part-completed.json`), not a hand-written payload | **P** — same as Codex; documented in `scripts/__tests__/fixtures/README.md`, "OpenCode's plugin events" |
| Cursor | **P** — declared route, `telemetryTaskAttributable: true` (`cursor.ts:147`) | **F** — journal test asserts the path | **✗** — hand-written payload | **✗ in effect** — nothing to attribute; no Cursor record exists |

### Dimension 5 — person

**These five cells are not independent.** `person_id` is stamped once, tool-agnostically, in
`ReadLocalCostUseCase` (`read-local-cost-use-case.ts:486-487`) onto records that already
exist. There is no per-tool code path. The honest grade is: **one path, graded once**, present
for the four tools that produce a local-read record, and structurally absent for Cursor
because there is no record to stamp.

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code / Codex / Copilot / OpenCode | **F** — one shared path, `:486-487` | **F** — `read-local-cost-use-case.unit.test.ts` "stamps the identifier a person chose, and a display name only once they set one"; "stamps no person field when nobody opted in - the default"; "leaves a session stored before opting in unnamed, even on a later read". `cost-report-person.unit.test.ts` 13 by-value tests. 13 identity e2e tests incl. "carries no person field anywhere, proven from the stored bytes" | **n/a-by-nature** — the identifier is generated locally, not captured from a tool. Validated by construction against the stored bytes, which is the right evidence for this field. | **F** — a self-generated, opt-in identifier; never derived from a git author, email, or hostname; three-way resolution (`mapped`/`unresolved`/`none`) mirrors step attribution |
| Cursor | **✗** | **n/a** | **n/a** | **n/a** — no record exists to carry it |

### Dimension 6 — project

`project_id` comes from the run journal's `session_start`, joined at read time
(`session-project.ts:23-33`, `read-local-cost-use-case.ts:485`), never re-derived from where
the reader is standing.

| Tool | Captured | Tested | Validated | Normalised |
| --- | --- | --- | --- | --- |
| Claude Code | **F** | **F** — `session-project.unit.test.ts` 5 tests; `read-local-cost-use-case.unit.test.ts` "prefers the remote, and says so" / "falls back to the directory-name field with no remote, and says so" / "stores no project for a session with no journal at all"; journal test asserts `project_id` + `project_remote` | **P** — value assertions use the hand-built `makePayload`; the real `claude-code-session-start.json` is replayed status-only. The multi-tool e2e does exercise the real hook end to end. | **F** — `project_field` names which of the two fields won, exactly as `vendor_field` does for the identifier |
| Codex | **F** — session identity derived from the rollout filename, not `session_id` (`tools/codex.cjs:24-40`) — the resumed-session correction | **F** — "a Codex session-start writes a session_start line naming codex, vendor_field conversation.id" | **P** — real `codex-session-start.json` replayed status-only; value test on a builder. The **identity derivation** is separately validated against two real rollouts. | **F** |
| Copilot | **F** — both spellings (`tools/copilot.cjs:12`) | **F** — two tests, one per builder shape, each asserting `vendor_id` is the real id "not the string \"undefined\"" | **P** — real `copilot-compat-*.json` replayed status-only for the journal write; `detectHost` *is* asserted on the real fixtures (`:149-160`) | **F** |
| OpenCode | **F** — via `hooks/opencode-plugin.js` building its own payload | **F** — `opencode-plugin.test.js` | **P** — no vendor payload exists to capture; the plugin authors it | **F** |
| Cursor | **F** — `readCwd` resolves the first `workspace_roots` entry that is a git repo (`tools/cursor.cjs:23`) | **F** — "a Cursor session-start payload carrying no cwd still produces a run file"; "a Cursor workspace whose first root is not a git repository resolves to the root that is, not index zero"; `readCwd` unit table | **P** — value test on a builder; real `cursor-session-start.json` replayed status-only | **F** — `vendor_field: null` is a *stated* fact (the export was never measurable), not a gap |

---

## 1. What is solid

Captured, value-tested, validated against a real capture, and normalised to one meaning:

1. **Claude Code — tokens.** The reference implementation. All four counters or none
   (`:73-86`), `<synthetic>` messages excluded on the marker rather than on all-zeros, and
   the per-`message.id` dedupe keeps the *last* line — a correction worth 37.4% of output
   tokens on the machine it was measured on.
2. **Claude Code — model**, and the `<synthetic>` guard that keeps a fabricated notice out
   of the model breakdown.
3. **Claude Code — step, tool-stated.** The strongest attribution anything here offers:
   exact per message, on the same line as `usage`, plus the plugin name. Correctly refuses
   to assert "no skill ran" when the field is merely absent.
4. **Codex — tokens.** The increment is summed, never the cumulative; the verbatim
   re-emission is suppressed (measured at 291/16,415 events across 38 rollouts); and
   `input_tokens` is made exclusive to match Claude's convention. This cell is better than
   its own tooling needs it to be.
5. **Codex — model and effort**, from `turn_context` rather than the counted event.
6. **Codex — session identity.** The resumed-session derivation (`session_meta.id` off the
   filename, never `session_id`) is validated against two real rollouts and prevents 38% of
   Codex sessions reading as absent.
7. **Copilot — tokens, at session granularity.** Real capture, arithmetic reconciliation
   against `modelMetrics`, and a correct refusal to read `usage` (cache-inclusive) or
   `totalPremiumRequests` (a multiplier, not currency).
8. **Copilot — model, correctly absent.** Declining to stamp `currentModel` is the right
   call and is tested as such.
9. **Step attribution as a three-way fact.** `tool-stated` / `journal-interval` /
   `unattributed` is never collapsed, always present, and the contract explains why
   `unattributed` cannot be read as "no step ran".
10. **Person.** One path, opt-in, never derived from a git author or email, with a three-way
    resolution and a proven-from-the-bytes e2e that a default install stores nothing.
11. **Project, on all five hosts.** Including the two hard cases — Cursor's absent `cwd`
    resolved from `workspace_roots`, and a leaked `GIT_DIR` never redirecting a session.
12. **Every double-count rule.** All three (kind-mixing, re-read matching with strict-improve
    correction, `billed_request_id` collapse) are implemented, by-value tested with the
    defect *reproduced* first ("sums a naive union of both routes' records to double — the
    reproduced defect"), and reconciled exactly.
13. **The declaration guard.** `telemetry-route-supply.unit.test.ts` checks each tool's
    `supplies` against what its reader actually produces from the real capture. A route
    claiming something its reader never sets fails here. This is the mechanism that keeps
    the rest of the matrix honest, and it works.

## 2. Captured but weakly evidenced

Ranked by what a wrong value costs.

1. **Copilot — tokens — input/cache-read exclusivity (highest cost).** Captured, tested,
   validated. But the normalisation rests on one arithmetic identity from one capture:
   `tokenDetails.input (10) + cache_write (21070) = modelMetrics.usage.inputTokens (21080)`.
   That capture has `cache_read: 0`, so it cannot distinguish "`input` excludes both cache
   figures" from "`input` already includes `cache_read`". The cache figures dominate the
   others: in that same capture `cache_write` reads 21070 against an `input` of 10 — three
   orders of magnitude — so a cache counter folded into `input` would swamp it entirely. If
   the second reading is true, every Copilot session with
   a real cache hit silently inflates `input_tokens`, and — because Copilot yields one
   whole-session record with no per-request lines — there is no internal cross-check that
   would ever reveal it. **Nothing declares this.** Full detail in finding **N-1**.
2. **Task, on Copilot / Cursor.** The extraction logic is exercised only against
   hand-written payloads (`readTaskPayload`, self-described as such). Two of the three hosts
   this once listed have since gained a real capture behind the value assertion — Codex
   (`codex-cli 0.151.0` is now runnable) and OpenCode (settled by measurement, see the
   task dimension table above); Copilot's JSON-string `toolArgs` and Cursor's absolute
   `file_path` remain hand-written. A wrong value here mis-bills a whole task interval.
   Mitigating: real captures for these shapes *do* exist in the same directory and are used
   for the step dimension, so closing this is cheap.
3. **Project, all five hosts.** Value assertions run on builders; real session-start
   captures are replayed for exit status only. A wrong `project_id` mis-attributes an entire
   session. Mitigating: `detectHost` *is* asserted against the real fixtures, the multi-tool
   e2e drives the real hook, and the failure mode (no run file written) is loud rather than
   silent.
4. **OpenCode — tokens and model, across providers.** The capture and the by-value tests are
   sound. The weakness is coverage breadth, not evidence quality: exclusivity is measured for
   providerID `anthropic` only, and OpenCode is the one tool that can route to arbitrary
   backends. A provider reporting prompt tokens *inclusive* of cached ones would double-count
   through this mapping. Ranked fourth rather than higher precisely because it is **declared**
   — `opencode.ts:190-193` states the limit and the contract's per-tool row repeats it, so a
   consumer is warned. Structurally weaker as fixtures go: the only counter fixture outside
   the mirrored-`$HOME` `local-cost/` layout, and the adapter path reaches OpenCode through a
   shell stand-in rather than this file.
5. **Claude Code — task via written path.** The three real `post-tool-use-{write,edit,
   notebook-edit}.json` captures are replayed status-only; the value test uses a mirror.
   Lowest cost of the five: Claude Code is the one host that states the path in a dedicated
   field, so drift is least likely and would break loudly.

## 3. What is not captured at all, per tool — and whether the tool emits it

| Tool | Not captured | Does the tool emit it? |
| --- | --- | --- |
| **Claude Code** | `cost_usd` | **No.** No local file carries a billed amount. It was only ever available via the now-deleted export route. Correctly absent, never zero. |
| **Codex** | tool-stated step; `cost_usd`; written path | **Step: no** — nothing in a rollout names a running skill. **Cost: no.** **Written path: emitted, but inside an `apply_patch` command string** that would have to be parsed — a real, unclaimed capture opportunity. |
| **Copilot** | `model`; per-request anything; `cost_usd` | **Model: yes, ambiguously** — `currentModel` (last model only) and a per-model `modelMetrics` map. Deliberately not read, correctly. **Per-request: no** — nothing in its files counts a single request. **Cost: emitted as premium requests, not currency** — measured invariant to consumption across fourteen sessions. |
| **OpenCode** | step (both routes); task; `cost_usd`; `providerID` | **Step: no payload exists** — the plugin sees only `session.created`/`session.idle`, never a tool call. **Task: same cause.** **Cost: emitted as `info.cost`, always `0`, denomination never established** — deliberately unread. **`providerID`: emitted and deliberately dropped** — see **N-2**. |
| **Cursor** | tokens; model; and, in effect, everything downstream of a cost record | **Tokens: no.** Probed and measured — Cursor writes no token count in any file it produces. This is the correct grade and the codebase states it with a reason rather than a shrug. Cursor's *journal* dimensions (step, task, project) are captured and tested, but attribute nothing, because no Cursor cost record can exist. |

## 4. Where meanings differ under one field name

These are the normalisation failures — the ones that silently corrupt an aggregate.

### N-1 — `input_tokens` on Copilot: an undeclared inclusivity assumption ⚠️ **undocumented**

Every reader promises `input_tokens` exclusive of the cache figures. Three tools prove it:
Claude Code by its API's documented behaviour, Codex by explicit subtraction
(`codex-rollout.ts:102`), OpenCode by reconciliation — *and OpenCode declares the residual
risk* (`opencode.ts:190-193`, mirrored in the contract's per-tool row).

Copilot's proof is one identity on one capture, and that capture has `cache_read: 0`:

```
tokenDetails.input (10) + cache_write (21070) = modelMetrics.usage.inputTokens (21080)
                        + cache_read (0)      ← indistinguishable
```

Both hypotheses fit. `copilot-events.ts:6-10` states the conclusion as settled
("`tokenDetails` already exclusive"); the capture settles it only for `cache_write`.

**Why this ranks first:** OpenCode has the structurally identical risk and *declares* it, so
a consumer is warned. Copilot's `limitation` string mentions only session-vs-request
granularity (`copilot.ts:359-361`) and says nothing about exclusivity. Same risk class, one
declared, one silent. Copilot is additionally the only readable tool absent from every e2e —
`telemetry-multi-tool.e2e.test.ts:8-17` covers three tools and says so.

### N-2 — `model` on OpenCode: the provider is stripped, contradicting the contract ⚠️ **docs-vs-code contradiction**

`metrics-contract.md:563` — *"the model identifier the tool itself used, **unmodified**."*

`opencode-export.ts:11-14` deliberately drops `info.providerID`, so
`anthropic` + `claude-sonnet-4-6` is stored as `claude-sonnet-4-6`. That is a modification.
The word "provider" appears **nowhere** in `metrics-contract.md` (verified by grep) or in
`cost-report-contract.md`, so the difference is documented nowhere a consumer would look.

Two concrete corruptions, both in `byModels`, which keys on the bare string with no tool
component (`cost-report.ts:478-480`):

- Two OpenCode sessions routing the same model name through different providers collapse
  into one indistinguishable row.
- An OpenCode record and a Claude Code record naming `claude-sonnet-4-6` merge into one row —
  which may well be intended, but is a decision the contract never states and a consumer
  cannot detect.

The source comment reasons the choice carefully (the record has no provider field; adding
one is a schema change). The reasoning is sound; the *contract text* is the defect.

### N-3 — `step` on Copilot and Cursor: recorded, unattributable ⚠️ **structural**

`step` means "the skill that was running when this amount was spent". On Copilot the journal
records real `step_start` lines from real captures — but the local read yields exactly one
`kind: "session"` record for the whole session, which by the contract's own rule is never
placed in `by_step`. On Cursor there is no record at all. In both cases the journal writes
step lines that no amount can ever attach to.

The contract states the *consequence* for Copilot ("no amount can be placed inside a step")
but does not connect it to the fact that the journal still records steps for that host. A
reader of the journal alone would reasonably expect those steps to be costable.

### N-4 — `kind` as the carrier of granularity ✅ **documented, cited**

Copilot's four counters are a whole-session total; Claude's, Codex's and OpenCode's are
per-request. Same four field names. This *is* correctly handled: the difference is carried by
`kind` (`copilot-events.ts:89`), and the contract devotes a section to it ("The two record
kinds, and why they are never summed"), names Copilot as the exception that shows where the
line is drawn, and gives the consumer the exact rule. Tested by "never collapses a
`kind: 'session'` record sharing a turn_id (Copilot's shutdown total)" and "carries a session
total on the tool's own row, never on the period total". **Not a defect** — listed so the
contrast with N-1 is clear: this is what a properly declared difference looks like.

### N-5 — `step` as tool-stated vs journal-interval ✅ **documented, cited**

A measurement on Claude Code; an inference from a time interval everywhere else. Carried by
`step_attribution`, never collapsed, always present, and explained in the contract's "Step
attribution" section including why `unattributed` cannot be read as "no step ran". **Not a
defect.**

### N-6 — `turn_id` is not a unique key ✅ **documented, cited**

Its meaning differs by tool and route (`requestId`, `prompt.id`, `turn_id`, `id`) and it is
explicitly *not* unique per billed request. Carried by `turn_field`, with
`billed_request_id` provided as the field that *is* unique where present. **Not a defect.**

## 5. The single weakest cell

### **Copilot × tokens × normalised.**

Chosen on the discriminator the question implies: *which cell, if wrong, silently corrupts an
aggregate with nothing warning the consumer?*

- It is **captured, tested and validated** — so nothing in the test suite flags it.
- Its normalisation rests on an identity the sole capture **cannot discriminate**.
- The quantity at risk is large: in the one capture, the cache figure exceeds `input` by
  three orders of magnitude (21070 vs 10), so folding it in would swamp the field.
- Copilot's single whole-session record admits **no internal cross-check**; there are no
  per-request lines whose sum could disagree with a total.
- **Nothing declares it.** `supplies` says `tokenCounters: true`; the `limitation` string
  speaks only to granularity; the contract's Copilot row speaks only to `usage` vs
  `tokenDetails`. A consumer following the contract exactly would have no reason to doubt it.
- Copilot is the only readable tool with **no e2e coverage at all**.

The comparison that settles it: OpenCode carries the same class of risk and is *safe*,
because it is declared. The gap is not the measurement — it is the missing declaration.

### What it would take to close it

In descending order of value; the first alone closes the cell.

1. **Capture one Copilot session with a non-zero `cache_read`.** A second turn in one session
   against a cache-enabled model produces it. Then check whether
   `modelMetrics.<model>.usage.inputTokens == tokenDetails.input + cache_write + cache_read`
   (exclusive) or `== tokenDetails.input + cache_write` (inclusive). Add it as a third
   `local-cost/.copilot/session-state/<id>/events.jsonl` fixture. One capture, one assertion,
   and the cell becomes fully normalised.
2. **Until then, declare the limit.** Extend `copilot.ts:359-361` the way `opencode.ts:190-193`
   already does — e.g. *"its input figure is measured exclusive of cache writes; exclusivity
   against cache reads has never been captured, as the only measured session read zero"* —
   and add the sentence to the contract's Copilot row. This costs nothing and converts a
   silent risk into a declared one.
3. **Put Copilot into the multi-tool e2e.** It is the only readable tool absent from it, and
   both its fixtures already sit in `local-cost/`. This would also exercise the
   `kind: "session"` path end to end, which today is proven only at the unit and adapter
   layers.

### Two more, close behind

- **N-2 (OpenCode `model`)** — a one-line contract fix. Either amend the Field reference to
  say the provider is stripped and why, or add a per-tool sentence. The code needs no change;
  the *text* is what is wrong, and a contract written for an external consumer is exactly where
  that matters.
- **Task validation on Codex / Copilot / Cursor** — swap `readTaskPayload`'s hand-written
  shapes for the real captures already sitting in `scripts/__tests__/fixtures/`, the way
  `stepPayload` already does. The captures exist; only the wiring is missing.

---

## Checklist findings (baseline review)

Applied to the telemetry code and docs read for this audit.

- **No information duplication** — ✅ with one deliberate, documented exception: the Codex
  rollout-filename parse exists in both `cli/src/domain/formats/codex-rollout.ts` and
  `plugins/aidd-telemetry/hooks/lib/tools/codex.cjs`, because `hooks/` is copied verbatim by
  the framework build and can import nothing from `cli/`. The duplication is stated at
  `tools/codex.cjs:9-18` and pinned by a test that turns red if either moves. Correctly
  handled.
- **No incoherence or contradiction** — ⚠️ **one finding: N-2.** `metrics-contract.md:563`
  says `model` is stored "unmodified"; `opencode-export.ts:11-14` modifies it. This is the
  only docs-versus-code contradiction found.
- **No over-engineering** — ✅. Every abstraction earns its place. The per-host
  `hooks/lib/tools/*.cjs` split replaced hand-maintained parallel tables and the derived
  `STEP_START_BY_HOST` / `WRITTEN_PATH_EXTRACTOR_BY_HOST` maps mean a host cannot be half-added.
- **No dead code or debug leftovers** — ✅. The deleted export route was removed from the code
  while its *contract text* was deliberately retained, with an explicit header explaining that
  `provenance: "export"` remains a valid value on an append-only sink. That is correct
  reasoning, not a leftover.
- **Minor, non-blocking** — `file-writes.cjs:120` reads `payload.cwd` directly where
  `step-starts.cjs:34` and `task-declared.cjs:85` use `readCwd(host, payload)`. Harmless today
  (only Claude Code declares a `writtenPath`, and its `readCwd` *is* `payload.cwd`), but it is
  the one place a future host with a differently-spelled working directory would silently fail
  to journal a written path.

## Evidence

Every claim above rests on a command that ran. All green, zero skipped.

| Command | Result |
| --- | --- |
| `npx vitest run tests/domain/{formats,models,tools} tests/infrastructure/adapters` | 120 files, **1683 passed** |
| `npx vitest run` (6 mapper + adapter files, `--reporter=verbose`) | **55 passed**, 0 skipped |
| `npx vitest run` (8 attribution + use-case files, `--reporter=verbose`) | **157 passed**, 0 skipped |
| `node --test scripts/__tests__/aidd-telemetry-journal.test.js` | **192 passed**, 0 failed, 0 skipped |
| `npx vitest run tests/e2e/telemetry-{multi-tool,identity}.e2e.test.ts` | **27 passed** |

Test names are quoted verbatim throughout so each grade traces to a case that ran. No file
was modified; no `aidd telemetry` command was executed against a real HOME.
