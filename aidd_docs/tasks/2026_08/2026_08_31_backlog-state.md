# Telemetry backlog state — 2026-08-31

Read-only re-audit of the telemetry backlog against `claude/aidd-telemetry-layer-e403uf` at
`2d27775a`. Every verdict is tied to a file, a line, or the output of the built CLI run under a
sandboxed `HOME`. No issue was created, edited, closed, commented on or labelled; nothing was
committed, stashed or reset.

It supersedes `2026_08_28_backlog-audit.md`, which is three days stale. §7 says where it was wrong.

The binding document is
[`aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md`](../../memory/internal/decisions/measurement-may-reach-a-hosted-destination.md)
(accepted 2026-08-31). Two of its clauses decide most of what follows:

- **Clause 4 — "the framework exposes; the destination analyses."** Aggregation across people and
  repositories, saved views, filters and pushes belong to a destination.
- **The constraint that makes it safe** — a hosted destination is *a* destination, never *the*
  destination, and is never ours to fix.

One distinction runs through every verdict and is easy to collapse by mistake: **exposure is not
"local", and analysis is not "hosted".** Building the outbound path is exposure work and stays the
framework's; deciding what a week of a team's work means is analysis and is not.

## 1. Scope correction

The brief listed 8 open issues in "Aggregate across tools and people" and 6 in "Prove what an AI
session costs". `gh issue list --milestone` returns more. Five in-scope issues were missing from the
brief and are audited here:

| Issue | Milestone | Why it is in scope anyway |
| --- | --- | --- |
| 653 | Aggregate | The decision record names it by number in its own Consequences |
| 704 | Aggregate | Open, and in #706's `Closes` list |
| 720 | Aggregate | The decision record names it as "the first thing this boundary touches" |
| 702 | Prove | Open, and named in #706's "left open deliberately" |
| 703 | Prove | Open, in #706's `Closes` list, and the PR body says its work is unfinished |

An audit graded against the decision record that omits the two issues the record names by number
would be incomplete on its face.

## 2. Verdicts

> **Read the #297 row first.** It is at the bottom of these tables because it is a context issue,
> not because it is minor. It is the one finding whose cost compounds daily, and it is why it is
> ranked first in §5.

### Milestone "Aggregate across tools and people" (11 open)

| Issue | Verdict | Evidence |
| --- | --- | --- |
| **652** (parent) | **rescope — most of its boundary moved off the framework** | Its gate is now settled and its "decision — made" section is factually correct: `AIDD_TELEMETRY=0` verified live overriding an `enabled: true` project switch (`telemetry check` printed `measurement allowed no — this person's own refusal (AIDD_TELEMETRY)`); `forget` verified previewing then refusing without `--yes`. What remains framework-side in its Boundaries is the price table (#654) and the commit trailer (#630). "Includes: Codex, Copilot, Cursor and OpenCode, added one at a time" was delivered by the *other* milestone. "Includes: the upload, and reporting per person, per team and per epic" splits: upload is #662 (framework), the reporting is destination-side under clause 4. |
| **653** | **already done by another route — close it, do not rewrite it** | Its Outcome ("each remaining tool joins the same chain, with its coverage stated honestly") is delivered by local read: `claude-code-transcript.ts`, `codex-rollout.ts`, `copilot-events.ts`, `opencode-export.ts`, and Cursor declared `not-covered` with a reason, printed live by `telemetry check` as `not covered: cursor — It writes no token count in any file it produces.` Done-When 2 is met by the closed reason set in `telemetry-claim.ts` (`untrusted-codex-hook`, `recorder-declared-nowhere`, `recorder-declared-not-yet-fired`, …). Done-When 3 is met. Done-When 4 is met for Claude Code by `.github/workflows/cli-ci.yml:120,143`. Only Done-When 1 ("the hook identifier and the export identifier side by side") is unbuildable, and only because the export route it names is gone. |
| **654** | **still valid — premise inverted, and the record protects it** | Its "Measured: Claude Code exports cost in USD" was true of the export route only. `metrics-contract.md:524-531`: `cost_usd` is "**never** present on a local-read record for any tool measured so far". Zero tools supply an amount, not two — the table is *more* necessary than the issue claims. The decision record keeps it explicitly: "An amount in currency still has no route. That is #654's price table, unaffected either way by this decision." |
| **655** | **describes a deleted route — close it, fold its one live clause into #662** | Its entire premise is a trade that no longer exists: `grep -rn "OTEL_LOG_TOOL_DETAILS\|skill_activated"` over `cli/src`, `plugins`, `docs`, `aidd_docs/product` returns **nothing**. There is no flag, so Done-When 1 is unassertable. Done-When 2 ("the allowlist is enumerated in one place") is already met by `metrics-contract.md`'s field reference plus the typed `TelemetrySinkRecord`. Done-When 4 is the only live sentence, and it is already a bullet inside #662 ("the redaction of #655 applied on this path"). |
| **656** | **belongs to the destination** | The decision record assigns it by name: "#656 lands squarely on the destination side … it should be re-scoped there rather than pursued as local work." Two of its ACs are already delivered locally and should be struck rather than carried: attached/unattached share (`step_attribution`, three strengths) and per-person (`by_person`, envelope v4, `person` in `ARTEFACT_AXES`). Its "a person sees their own figures before anyone else" becomes the destination's obligation per decision clause 5, not a framework deliverable. |
| **661** | **already done — close at merge, and it is missing from #706's `Closes` list** | `person-resolution.ts` gives `mapped \| unresolved \| none` with unresolved as its own row; `ResolvedPerson.identities` carries the raw identifiers behind a line (the auditability AC); `identity use <identifier>` covers one human on two machines; `link`/`unlink` cover an identifier a person cannot choose. Its last AC — "names or pseudonyms follows the decision issue" — is now **answered**, not waived: #660 is closed and the record reaffirms the privacy clause ("a random value they opt into … never derived from a git author, an address or a hostname"), with `identity name <value>` as an explicit further opt-in. |
| **662** | **still valid — framework-side, needs one rescope** | No upload exists: `grep -rn "upload" cli/src --include='*.ts'` returns nothing. This is exposure, not analysis, so clause 4 keeps it here. One change required: "a hosted dashboard" must become "a destination the person names", per the record's testable constraint that no host is compiled in, defaulted to, or preferred. Absorb #655's Done-When 4. |
| **676** | **already done except one Done-When — must NOT close** | `hooks/opencode-plugin.js:47-55` maps `session.created` → `session-start` and `session.idle` → `turn-end`; `opencode.ts:165 acceptsHooks: true`. Unmet: "`docs/ARCHITECTURE.md` records the second installation mode" — that file's only OpenCode row (`:53`) still documents the declarative axis alone, and the file contains no mention of `opencode-plugin`, a plugin API, or in-process loading anywhere. Its AC "the same ten keys as every other tool" describes the retired schema v1; the journal is line-typed v2 (`aidd_docs/runs/README.md:9`). |
| **704** | **already done** | `by_project` in the envelope (`cost-report-envelope.ts:179`, the v2 bump names it), `project` in `ARTEFACT_AXES`, `--project` filter, `project_id`/`project_field` in the contract, `NO_KNOWN_PROJECT = "no known project"` for pre-change records, and `parseOwnerRepoFromRemote` collapsing two checkouts of one remote to one project. |
| **720** | **still valid, but gated on an argument the issue does not yet contain** | Not built: `ARTEFACT_AXES` is `total, day, step, model, tool, project, person`; no `by_task` anywhere. The record names it: "#720 is the first thing this boundary touches … it should be re-argued rather than built by default." The argument is winnable — "which of my tasks cost the most" is one person asking about their own machine's data, not a cross-person or cross-repository question, and `--task` already exists as a filter so the data is present — but it has to be *written into the issue* before the eighth axis lands. Its body's "The six axes are…" is also stale; there are seven. |
| **630** | **still valid — untouched** | `grep -rn "AIDD-Session-Id\|prepare-commit-msg\|interpret-trailers" cli/src plugins .github docs` returns nothing. Not a duplicate: #679 was closed `NOT_PLANNED` on 2026-08-20 explicitly as a duplicate *of #630*, with its one distinct point moved across. Framework-side under clause 4 — it makes a record joinable, it does not analyse. |

### Milestone "Prove what an AI session costs" (8 open)

| Issue | Verdict | Evidence |
| --- | --- | --- |
| **631** (epic) | **already done — with two text corrections, not one** | Known: the success evidence says "the same skill proves both" and it is two, `01-cost` and `02-check`. **Not previously found:** its Boundaries still read "Includes: **the collector**. Claude Code supports no file exporter … so a receiving endpoint is a component of this epic, not an externality." That is now false — the receiver was deleted and local read replaced it. Correct both before closing. |
| **681** | **already done** | `host.cjs:56-68` recognises the `_vsCodeCompat` shape (`timestamp` + `hook_event_name` + `session_id`) alongside the canonical one, "Measured 2026-08-21 against a real @github/copilot@1.0.80 session", with six `scripts/__tests__/fixtures/copilot-compat-*.json` captures behind it. Both of its "not confirmed against a real payload" bounds are now closed. |
| **694** | **partly done — must NOT close** | The diagnostic half is delivered and verified live: `telemetry check` printed the four questions in order with distinguishable answers (`hook fired FAIL … / session journalled -- / tool files readable -- / records join --`), over a closed reason set. Three ACs remain unmet: the hundred-session period (#706's own body: "measured against a synthetic tree, not the hundred-session one it names"), the turn-end walk timed on a real task tree with its cap set from that number (no cap constant found in `task-declared.cjs`), and the live multi-step flow — which #703 shows could not be run. |
| **699** | **already done — all four Done-Whens** | `codex.ts:123-126 CODEX_HOOKS_TRUST_NOTICE` is emitted at install time as a `PluginInstallNotice` (delivered-but-gated, deliberately distinct from a skip) and names both paths: "approve the prompt once in an interactive session, or pass `--dangerously-bypass-hook-trust` to `codex exec` for a headless run. Until then, a session leaves no run journal and nothing says why." Done-When 2 is met by the `untrusted-codex-hook` claim reason plus `resolveHookTrust` (`diagnose-telemetry-use-case.ts:180-188`); Done-When 4 by `plugin-add-hooks-trust-notice.integration.test.ts`. One nuance to record when closing: the headless path *bypasses* trust rather than granting it — which the issue's own "Out of scope: granting trust automatically" arguably requires. |
| **700** | **already done** | `cli/assets/configs/codex/config.toml` writes no model, asserted by `asset-loader.unit.test.ts:31-37`, whose comment cites #700 by number: "Model choice is owned by the account, not this repo — Codex's own default applies." |
| **701** | **already done — its "must be measured first" was measured** | `hooks/lib/tools/copilot.cjs` reads the skill name behind both spellings via `skillNameFromAnyArgument`, with the compat branch "captured 2026-08-22 against a real @github/copilot@1.0.80 skill call". The capture is at `scripts/__tests__/fixtures/copilot-compat-post-tool-use-skill.json` and carries exactly the two values the issue says are unknown: `tool_name: "skill"`, `tool_input: { "skill": "00-init" }`. |
| **702** | **stale premise — rewrite down to one Done-When** | Its whole argument rests on `skills/01-cost/scripts/lib/readers.js` and a byte-for-byte parity test. That second implementation is deleted (#706: "25 files, 4,355 lines — and the parity suite with it"); the plugin ships no script. Tool declarations now live once, in `hooks/lib/tools/*.cjs`, a directory an install carries. Done-When 1 is **met**. The residue is Done-When 2's proof method, which is what #706 leaves open: the install shape is reconstructed by the guard rather than driven through the real translator. |
| **703** | **still valid — must NOT close, despite being in #706's `Closes` list** | #706's own body: "#703's *'a session that resolved no skill is distinguishable from one that needed none'* has no implementation." Confirmed absent from `cli/src`. Closing an issue in the same PR that says it did not finish it is the failure mode this backlog keeps repeating. |

### No milestone, telemetry-related (8)

| Issue | Verdict | Evidence |
| --- | --- | --- |
| **511** | **stale premise — not telemetry, not on this branch** | `cli/src/domain/tools/ai/` holds `claude, codex, copilot, cursor, opencode` and no `gemini`. Its "Verified surface mapping — added after implementation" section reads as landed; the work is on `feat/511-gemini-flat-build-target` and is an ancestor of nothing shipped. Its only telemetry relevance is that a sixth tool inherits #683's tool-name branching. |
| **657** | **rewrite down to rotation alone — three of its four halves are now closed** | Version-control status: closed (`.gitignore` + `TelemetryOnUseCase.protectRunsDir`, verified live: `on` printed "Added `aidd_docs/runs/` to .gitignore"). Schema versioning: closed on the sink (`telemetry-sink-record.ts:153-155` throws `UnknownTelemetrySinkSchemaVersionError` on an unknown version) and the journal is `schema_version: 2`, line-typed. Its Done-When 5 is **now met** — verified live, `off` prints "This stops new recording only — sessions already journalled stay in `aidd_docs/runs/` … Run `aidd telemetry forget` to remove what was already measured." Live residue: **journal rotation**. `pruneOldDayFiles` in `read-local-cost-use-case.ts:304-325` is the *sink's* 90-day prune; nothing prunes `aidd_docs/runs/`. `forget` deletes everything, which is a deletion path, not a rotation. |
| **680** | **already done** | `flat-hooks-merge.ts:45 Stop: ["stop", "sessionEnd"]` with the 2026-08-22 measurement recorded inline, plus its unit test. |
| **683** | **still valid, partly done — correctly left open** | One file per tool exists (`hooks/lib/tools/{claude-code,codex,copilot,cursor,opencode,index}.cjs`), so Done-Whens 1, 2 and 4 hold. Done-When 3 fails on two counts in the same file: `host.cjs:30 DECLARED_HOSTS = new Set([…five names…])` and `detectHost` at `:34-77`, which branches on `cursor`, `copilot`, `codex`, `claude-code` and `opencode` in executable code. Not a duplicate of #702: that one was the skill-side copy, now deleted; this is the hook-side axis. |
| **693** | **already done** | `hooks/lib/repo.cjs:264-266` — "Decision, not an inherited default: a worktree keeps its own journal. `getRepoRoot` resolves `--show-toplevel`, the worktree's own root - never `--git-common-dir`'s shared repository." Taken and written. |
| **695** | **already done** | `run-journal-reader.ts:39-43` declares `worktree_id` and `worktree_repo_id`; `aidd_docs/runs/README.md:15` documents them as present only for a linked worktree. |
| **697** | **already done — its own "Actual" line is false** | `copilot.ts:356-362` declares `telemetryLocalRead: { kind: "declared", supplies: { tokenCounters: true, amount: false, toolStatedStep: false }, limitation: "…session.shutdown carries all four counters for the whole session — a session total, never a sum of requests." }`. The issue's "## Actual — `not covered`" no longer holds. |
| **698** | **already done** | `codex.ts:248 acceptsHooks: true`, `:255 pluginRootToken: PLUGIN_ROOT_TOKEN`; its fifth AC (OpenCode looked at too) met by `opencode.ts:165`. |
| **705** | **already done** | `by_day` in the envelope (`cost-report-envelope.ts:182`; the v2 bump names it beside `by_project`), `day` in `ARTEFACT_AXES`, and `--from/--to/--days` on `report`. |
| **688** | **already done — verified, not inferred** | `as unknown as` fell from the issue's 44 occurrences to **one** in `cli/src` (`framework-build-use-case.ts:91`) and **zero** in `cli/tests`. `scripts/check-cli-layering.mjs` now scans `cli/tests` too (`:17 const TESTS`), carries that one survivor in `CASTS_ALLOWED`, and at `:125-127` fails the build if an allowlisted entry stops casting — so the allowlist cannot rot either. |

### Milestone "The board sees the whole feature" (4 open) — none delivered

| Issue | Verdict | Evidence |
| --- | --- | --- |
| **648** (parent) | **still valid, untouched** | Both gaps it names still hold. |
| **649** | **still valid, untouched** | `grep -rn "unit_id\|metadata.json"` over `cli/src` and `plugins` returns nothing. No task identity file exists. `task-declared.cjs` infers the task from a path in a tool call's own arguments — evidence, not an identity file, and it carries no upward link to a backlog item. |
| **650** | **still valid, untouched** | No `type:` frontmatter added to plan/phase/spec/review templates. |
| **651** | **still valid — and already correctly bounded by clause 4** | Not built. Its "It must not read telemetry … Cost belongs to the skill that can reach the sink, and to the dashboard" anticipates the decision record's boundary exactly. No rescope needed. |

### Context issue

| Issue | Verdict | Evidence |
| --- | --- | --- |
| **297** | **amended in a comment; its body still asserts the superseded text** | The amendment is real and dated (comment of 2026-08-31T05:23:15Z by @blafourcade). But the issue **body** still carries, verbatim and unmarked, "**Standard:** OpenTelemetry (spans, metrics, logs). Sink is an OTel collector. No SaaS." under a heading that reads "Decisions of record". A reader who opens #297 and does not scroll to the last comment reads a false decision — which is precisely the failure the record was written to end ("it costs nothing until the first person reads the decision and finds it false"). The record's own Consequences ask for exactly this: "Both issues should reference it rather than continuing to state the superseded text." Not yet done for #297's body. Its "Ground truth, checked 2026-07-10" block and "Blocked by #421" are also stale. |

## 3. What is actually done and shippable today

The honest inventory, taken from the built CLI run against a throwaway git repo with `HOME` and
`XDG_CONFIG_HOME` pointed at a scratch directory. The binary is current: `git status --short` was
empty at session start, so the working tree equals `2d27775a`, and `cli/dist/cli.js` (09:24)
postdates the last `cli/src` commit (`9d9316af`, 09:19).

**Seven commands, one route.** `aidd telemetry on | read | identity | check | report | off | forget`.
Nothing opens a port. Nothing writes a destination into a tool's settings file. `receive`,
`endpoint` and `endpoint clear` no longer exist as commands.

**Recording.** Zero-dependency CommonJS hooks journal `session_start`, step starts, turn ends and
task declarations for Claude Code, Codex, Copilot (both payload shapes) and Cursor; OpenCode joins
through an in-process ESM plugin rather than a declarative hook. `worktree_id` /
`worktree_repo_id` are recorded when a session ran in a linked worktree. Journal schema is v2,
line-typed and append-only.

**Reading.** Four format readers turn each tool's own files into one contract record; Cursor is
declared `not-covered` with a stated reason rather than reported as zero. `provenance: "export"`
records written by an earlier version stay readable, countable and reportable — the writer was
deleted, the reader was not (`telemetry-stored-export-record.e2e.test.ts`).

**Reporting.** `report` at envelope version 4 with seven breakdowns (`by_step`, `by_model`,
`by_tool`, `by_project`, `by_day`, `by_person`, totals), three renderings from one value (text,
`--json`, `--axis`), five filters (`--task`, `--project`, `--step`, `--model`, `--tool`) and a
period (`--from/--to/--days`). Every record states its own attribution strength; an unattributed
turn stays its own row. **No output carries an amount in currency**, on any tool.

**Diagnosing.** `check` states what is in place *before* grading: measurement allowed and from which
file, identity attached or not and where, where records are kept, and where a recorder declaration
was looked for. It then grades four claims, and distinguishes a recorder declared-but-never-fired
from one declared nowhere.

**Refusing.** `AIDD_TELEMETRY=0` is honoured by the hooks (`repo.cjs:128,136`) and the CLI
(`telemetry-switch.ts`) with the same predicate, and **wins over a repository's committed switch** —
verified live: with `.aidd/config.json` set to `enabled: true`, `check` reported
`measurement allowed no — this person's own refusal (AIDD_TELEMETRY)`.

**Forgetting.** `forget` previews the three stores it would clear (project journal, machine records,
machine identity), states what git history keeps regardless, and removes nothing without `--yes` —
verified live: "Nothing removed. Pass --yes to remove exactly what is listed above." `off` points
at it.

**Published contract.** `aidd_docs/product/metrics-contract.md` (record shape, closed field list,
double-count rules, per-tool coverage) and `cost-report-contract.md` (the `--json` envelope). Under
the decision record these stop being internal docs and become the interface a destination is
written against.

**Proven in CI.** `cli / Identifier join (Claude Code)` runs a real probe on every PR; `cli / Windows`
installs the packed tarball and spawns the real hook on `windows-latest`.

**What does not exist**, plainly: no upload, no destination, no `connect`, no price table, no
currency figure anywhere, no commit trailer, no `by_task` axis, no journal rotation, and no proof
at load beyond a handful of sessions.

## 4. #706 at merge

**Close (from its `Closes` list):** #680, #681, #686, #688, #693, #695, #697, #698, #700, #701, #704,
#705. #631 too, after correcting *both* stale sentences (§2: the "same skill" one and the collector
one). #699 is also complete and could be added — it is **not** in #706's `Closes` list.

**Add to the list — delivered here and missing:** #659 (`.github/workflows/cli-ci.yml:120`),
**#661** (§2) and **#699** (§2). All three are absent; the body plausibly predates the identity and
forget commits.

**Must NOT close, despite appearing in the list:**

- **#676** — its `docs/ARCHITECTURE.md` Done-When is unmet, and `ARCHITECTURE.md:53` still contradicts
  the shipped code.
- **#694** — three ACs unmet, one of them by the PR's own admission.
- **#703** — the PR body itself says its criterion has no implementation.

**Neither close nor leave as written:** #702 (premise deleted, rewrite to its one residue), #683
(partly delivered, body should say so), #653 and #655 (see §5), #657 (rewrite down to rotation).

## 5. Recommended order for what remains

Judged against the record's boundary, not against what the issues assume.

| # | Work | The dependency that forces this position |
| --- | --- | --- |
| 1 | **Correct #297's body**, and close #653 and #655 | Costs nothing and unblocks honest reading of everything else. #297's body still states a superseded decision as a decision of record — the exact failure the record exists to prevent. #653's outcome is delivered by another route and #655's premise does not exist in the code; leaving them open makes the milestone look four items larger than it is. Do this before anyone plans from the board. |
| 2 | **Fix the three doc-vs-code contradictions**: `ARCHITECTURE.md:53` (#676's own Done-When), `plugins/aidd-telemetry/README.md:110-112` (cites #697 and #680 as open when both are delivered, and says OpenCode writes "no journal entry" when `opencode-plugin.js:47-55` does), and #683's `host.cjs` | These are the only things standing between #676 and closure, and they are what a sixth tool would inherit. Must precede #511's Gemini target. |
| 3 | **Rewrite #720's argument, then build it or close it** | The record names it as the first thing the boundary touches. It is cheap either way, and it must be settled before #654 changes the artefact table, so that table absorbs one change rather than two. |
| 4 | **#654** (price table) | The only currency work the record explicitly keeps on the framework. Independent of upload. One contradiction to resolve first: `plugins/aidd-telemetry/README.md:117` says "turning tokens into money is a separate service's job", which reads as assigning pricing to the destination, while the record says #654 is "unaffected either way". Pick one and write it down. |
| 5 | **#662** (upload), rescoped to "a destination the person names", absorbing #655's Done-When 4 | This is the exposure boundary, not analysis, so clause 4 keeps it here. It blocks #656's cross-repository half, which is unreachable while the sink is machine-level. Its five testable constraints are already written in the record. |
| 6 | **`aidd telemetry connect`** — no issue exists (§6) | The record gives it a specification for the first time. It is the authentication half of #662 and should be scoped beside it, not after it. |
| 7 | **#656**, re-scoped to the destination's backlog | Depends on #662 for anything to arrive, on #654 for reported-vs-computed to stay distinguishable, and on the destination existing at all. Strip its two already-delivered ACs before moving it. |
| 8 | **#694's load evidence**, then **#703** | #694's remaining ACs need a live multi-step flow, which #703 currently makes impossible — a headless project resolves no skills. So #703 is not "a small correctness debt", it is the blocker on the milestone's own completion evidence. Order: #703 first, then #694's hundred-session period and the timed walk. |
| 9 | **#657's rotation**, **#702's residue**, **#707's residue** | Independent correctness debts with no dependants, with one coupling: **#702's residue and #683 (item 2) should be done together.** #702's surviving Done-When is "whatever holds the declarations cannot be silently dropped by an install — proven by installing", and #683's cleanup moves code inside the same `hooks/lib/` tree. Sequenced apart, the second re-proves the first. |
| 10 | **#630** (commit trailer) | Adds precision to a chain that already measures. By the issue's own admission it is not a capability gap. |

The board milestone (#648, #649, #650, #651) is independent of all of the above and can run in
parallel; #649 is its own critical path, since #650 and #651 both read what it writes.

## 6. Genuine gaps with no issue

1. **`aidd telemetry connect` has a specification and no ticket.** The record's Consequences state it
   outright: "`aidd telemetry connect` gets a specification it can be written against: authenticate
   to a destination the person names, and bind this machine's identity to an account there. Until
   now it had a purpose but no boundary." No open issue covers it. #662 covers transport and says
   "authentication, and where the credential lives" in one bullet, which is not the same artefact.

2. **Nothing enforces the record's five testable constraints.** The record makes them testable on
   purpose — no host compiled in or defaulted, the published contract is what travels, a
   self-hosted destination loses no capability, no account needed to measure or read, authentication
   is not a degraded mode. Today they are prose in a memory file. There is no check, no test, and no
   issue asking for one. Once a destination exists, the first violation will be invisible.

3. **The record contract has no versioning discipline commensurate with its new role.** The record
   says the contract and the sink's shape "stop being internal documentation and become the
   interface a destination is written against. They now deserve the care an API gets."
   `sink_schema_version` throws on an unknown version and `COST_REPORT_ENVELOPE_VERSION` is at 4
   with its bumps documented inline — good practice, but there is no compatibility policy, no
   deprecation window, and no issue asking for one.

4. **The journal has rotation nowhere.** `forget` deletes everything and the sink prunes at 90 days;
   `aidd_docs/runs/` grows without bound. #657 names it, but that issue's other three halves are
   now closed, so the live one risks closing with them.

5. **No evidence at load, on any axis.** #694 carries it as ACs, but the gap is broader than one
   issue: nothing in this layer has been measured against a real repository's task tree, a real
   multi-step SDLC flow, or a period holding more than a handful of sessions. Every performance
   number in the codebase is a cap somebody chose.

## 7. Where I disagree with the 2026-08-28 audit

| Its finding | My finding | Why |
| --- | --- | --- |
| #653 "stale premise", to be rewritten and deferred to "when someone actually needs export" | **Close it** | Three of its four Done-Whens are met by the local-read route, and its Outcome is achieved. Rewriting an issue whose outcome is delivered keeps a closed problem on the board. |
| #655 "still valid, half done" | **Close it, fold one clause into #662** | Its premise — the `OTEL_LOG_TOOL_DETAILS` trade — does not exist anywhere in the code. Its storage-side Done-When is already met. One live sentence is not an issue. |
| #660 rescoped and ordered **first**, as the thing everything waits on | **Closed, correctly, on 2026-08-31** | The record amends both #297 clauses, names its owner and date, states what a person sees about themselves and when, and describes the deletion path. Its own completion condition (#652 and #656 reference the decision) is met in both bodies. |
| Gap: "no user-level opt-out" | **Closed** | `AIDD_TELEMETRY=0`, one predicate mirrored between `telemetry-switch.ts` and `repo.cjs`, verified live overriding an `enabled: true` project switch. |
| Gap: "no single surface answers *what is on, for whom, and where*" | **Substantially closed by the rewritten `check`** | It now prints measurement-allowed + its file, identity attached + its file, where records are kept, and where a declaration was looked for — before it grades anything. A separate `status` command is no longer the gap it was; what is left is naming, not capability. |
| Gap: "team and epic have no source of truth" | **Dissolved, not fixed** | Under clause 4 that is #656's problem and #656 is destination-side. It is not a framework gap. |
| Gap: "the journal has no rotation and no deletion path" | **Half closed** | `forget` is the deletion path. Rotation is still missing, and remains a real gap. |
| #720 recommended third, "zero dependencies, smallest item" | **Gated on an argument first** | The record names #720 specifically and says it "should be re-argued rather than built by default". Building it as the smallest available item is exactly what the boundary was written to stop. |
| #661 "already done, one AC waivable to #660" | **Already done, no waiver needed** | #660 is closed and the record answers the pseudonym question directly. |
| #657 "still open: journal rotation *and* the disable statement" | **Only rotation** | `off` now names what stays and points at `forget`, verified live. |
| #631 "one text correction" | **Two** | Its "Includes: the collector … a receiving endpoint is a component of this epic" is now false and was not caught. |
| #694, #699, #700, #701, #702, #703 not examined | **Examined** | #681, #699, #700 and #701 are done and #699 is missing from #706's `Closes` list; #702's premise is deleted; #694 and #703 must not close. |

## 8. What this audit did not resolve

- **#707**'s residue ("one real session per tool that runs on the platform") was accepted from the
  prior audit; the Windows CI job was re-confirmed at `cli-ci.yml:181-182`, the per-tool real-session
  claim was not.
- **#297's fourth AC** — "a run with telemetry off costs nothing: no emission, no load" — is still
  unverified. `telemetry-refusal.e2e.test.ts` exists; whether it asserts *cost* rather than
  *absence of records* was not read.
- **Attribution to this branch versus its base `next`** was not separated commit by commit. Every
  "already done" is asserted against this branch's working tree, which is what merges.
