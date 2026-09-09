# Metrics contract

This is the contract for `TelemetrySinkRecord`, the one shape every AI-tool telemetry
line takes once it reaches storage. It is written for a consumer outside this
repository — a pricing service, an aggregator — that needs to price and attribute a
session's usage without reading this repository's source.

> **Writing a skill, or anything that reports on AIDD work?** Read
> [`cost-report-contract.md`](./cost-report-contract.md) instead. It describes the object
> `aidd telemetry report --json` prints, with the rules below already applied. Reading raw
> records makes you responsible for the three double-count rules, the split between the two
> record kinds, and re-read deduplication — which is worth doing once, in one place, and
> that place already exists. Everything a correct
consumer needs is below: the file layout, every field's meaning and presence
condition, the three ways a naive reader double counts, and what each tool can and
cannot supply.

> **The export route no longer writes.** The OTLP receiver, the export
> configuration and the mapper that turned a captured payload into a
> `provenance: "export"` record were all deleted in "one route, and every
> sentence about it true" — no code path in this repository can produce a new
> `"export"` line today. Everything below that describes the export route is
> kept, unchanged, because `provenance: "export"` stays a valid value on a
> stored line: the sink is append-only, a line already written under an
> earlier version of this tool is never rewritten, and a consumer reading a
> day file that predates this change still needs every rule below to read
> that line correctly. Read every present-tense sentence about the export
> route as a description of a stored line's own shape, not of a route still
> capable of adding to it.

## Where records live

Records are appended as JSON Lines, one JSON object per line, to a UTC-day file:

```
~/.config/aidd/telemetry/YYYY-MM-DD.jsonl
```

or under `$AIDD_TELEMETRY_DIR/YYYY-MM-DD.jsonl` when that environment variable is set —
it names this directory outright. `$AIDD_USER_CONFIG_DIR/telemetry/YYYY-MM-DD.jsonl` is
still honoured, for a machine configured before the two were split, and names the
directory *above* this one; a consumer has to look in both. The split exists because
`AIDD_USER_CONFIG_DIR` also relocates `auth.json`, so it could never be the variable a
team shares. A day file is append-only for its whole life — lines are never
rewritten in place, only added. A session's records can span more than one day
file if the session crosses midnight.

Every record carries `sink_schema_version` (currently `2`). A consumer that does
not recognize the version on a line should set that line aside rather than guess
its shape — a version exists precisely so a future, incompatible shape does not
get read as this one.

## The two record kinds, and why they are never summed

Every record's `kind` is either `"request"` or `"session"`, and the two measure
overlapping quantities in incompatible ways.

**`kind: "request"`** is one line per billed request — one line per call to the
model that produced a charge. `cost_usd` and the four token counters
(`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`) on
a `"request"` line are complete for that request: summing every `"request"` line
for a session gives that session's true total.

**`kind: "session"`** is a periodic delta of the same quantities, taken from a
metrics export that flushes on a fixed interval (10 seconds, for Claude Code —
`OTEL_METRIC_EXPORT_INTERVAL`) with delta aggregation temporality
(`aggregationTemporality: 1` in the OTLP payload): each flush reports only what
changed *since the previous flush*, not a running total. A `"session"` line is
**not** a per-session cumulative figure, and it is not guaranteed complete —
whichever flush windows happened to be exported before the process exited are
what got captured, and no more. Summing `"session"` lines therefore does not
reliably reproduce a session's true total, even before double-counting against
`"request"` lines is considered.

Copilot's is the exception that shows why the kind is drawn where it is: read
locally rather than exported, it is a **one-shot cumulative total** written once
at shutdown rather than a delta of a flush window. Both meanings share the rule
that matters — a `"session"` line is never added to a `"request"` line, because
one already contains what the other counts — so they share the kind. What
separates them is `provenance`: `"export"` for a flush delta, `"local-read"` for
a total a tool wrote for itself. A consumer that needs to tell them apart reads
that field, and no other.

**Measured on one captured session** (Claude Code, `session.id` =
`22177147-d8cb-4ee1-976f-0ef82bd62491`, captured 2026-08-20). The export route these
figures came from, and the two OTLP fixtures below, were deleted in "one route, and every
sentence about it true" — the figures are kept as historical measurement, on a capture no
longer in this repository:

| Source                                         | Kind        | Lines | `cost_usd` total |
| ----------------------------------------------- | ----------- | ----- | ----------------- |
| `otlp-logs-claude-code-subagent.json` fixture (deleted) | `"request"` | 2 | **$0.1605** |
| `otlp-metrics-claude-code.json` fixture (deleted) | `"session"` | 1 (of 6) | **$0.0151** |

This is not a contradiction: the request lines are every billed request the
session made; the metric line is one 10-second flush window's own delta. Summing
the two ($0.1605 + $0.0151 = $0.1756) overstates the session's true cost, and
using only the metric total ($0.0151) understates it by an order of magnitude,
because only one flush window was ever captured for this session.

**Rule: take `cost_usd` and the four token counters from `kind: "request"` lines
only.** Take `active_time_s` from `kind: "session"` lines only — no `"request"`
line, on any tool measured so far, carries active time; it exists solely as a
`"session"`-kind metric.

### One line per datapoint, never merged

A `kind: "session"` line is one metric datapoint, never merged with any other
datapoint from the same flush. The captured session above produced **six**
`"session"` lines for one flush window, one per datapoint: `cost_usd`,
`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, and
`active_time_s` — each its own line, each carrying only that one field among the
six (the other five are absent on that line). A consumer expecting one
`"session"` line per session, or one line per flush bundling every quantity
together, reads a fifth (or a sixth) of the truth per line it looks at.

## The other way to double count: a re-read appends unless matched

Local reading (`provenance: "local-read"`) works by re-opening a tool's own
transcript file, which keeps growing for as long as the session runs. Each read
sees every turn the file holds so far, not just what is new since the last read.
To keep a re-read from storing the same turn twice, the writer matches each
candidate record against what is already stored for that session, on `turn_id`
alone (never on line content, never on arrival order — a hash of the line changes
the moment the tool appends anything else to that same record).

**This match requires a `turn_id`.** A candidate with no `turn_id` cannot be
matched against anything, and is appended again on every read that sees it — by
design, not by omission: inventing an unstable key would be worse than leaving it
unmatched.

**A matched candidate is not always dropped — a still-open turn can correct
itself.** Some tools (Codex's rollout is the one measured so far) emit a
`kind: "request"` record for a turn before the tool itself has said the turn is
finished: a Codex turn is closed by the *next* `turn_context` line, and the last
turn in a file whose session is still running has none, so a rollout read while
its session runs is stored with whatever counters had arrived by then — partial,
and, without this rule, permanently so, since the next read's completed figures
would match the same `turn_id` and be silently dropped. Instead: a matched
candidate lands as a second line — the sink is append-only, so this is never an
edit of the stored one — whenever it is a `kind: "request"` local-read record
that **strictly improves** on the largest already stored for that `turn_id`
(every counter at least as large, at least one larger). Nothing else gates it:
a run journal's `turn_end` line, where one exists, says only that no further
growth is coming — it is never asked before accepting a correction, because a
candidate that strictly improves is itself the only proof needed that an
earlier reading was not final, whatever a journal's own clock says about it.
Idempotence — a re-read that brings nothing larger stores nothing new — falls
out of "strictly improves" alone, the same property an unmatched-then-matched
`turn_id` already had; nothing here depends on a session ever being confirmed
finished. A `kind: "session"` record sharing a `turn_id` (Copilot's shutdown
total, keyed on the shutdown event's own id) is never treated as a correction
opportunity: it is a one-shot cumulative figure with no provisional reading to
correct, and is dropped on a re-read exactly as before.

Because more than one record can now legitimately share a `turn_id` on the
sink, a consumer reading raw records must also collapse them before summing —
see "Consuming a session correctly" below. The largest wins, never a sum of two:
a later record that reads *smaller* than one already stored is never written at
all, so a stored `turn_id` group never needs to guard against a shrink, only
against counting more than one of its members.

**Worked example**, mirroring the tested behavior of the local-read use case: one
turn's transcript line carries 10 input tokens and 20 output tokens, under
`turn_id: "req_1"`. A first read appends it — 30 tokens stored. The session
continues and the same transcript file is read again (a re-read, same turn still
present in the file, no larger reading of it yet). Because `req_1` is already
stored and the new reading offers nothing more, the second read matches it and
stores nothing new. **Stored total after the second read: 30 tokens, not 60.**
Had the same candidate carried no `turn_id`, the second read would have appended
it again, and the stored total would have become 60 tokens for one real turn.
Had the second read's own transcript line instead carried 15 input tokens and 25
output tokens for the same still-open turn, it would land as a second,
correcting line, and the group's true total would be 40 tokens — the larger
reading, not 30, not 70.

A consumer aggregating raw appends from the sink file without replicating this
`turn_id` match — for example, re-implementing a local reader against a tool's
own files rather than consuming this sink — will double, triple, or *N*-times
count any record whose route has no stable per-record identifier, once per read
of an active session; and, for a route whose turns can be re-read while still
open, will sum a turn's own successive readings of itself rather than keeping
only the largest.

## A third way to double count: one billed call, seen by both routes

A tool whose export and local read were both declared and measured — only
Claude Code, ever — could have both routes live for the same session at
once: the OTLP export streamed `api_request` as each call completed, and a
local read of the same session's transcript, run at any point, sees the same
calls in the tool's own file. Each route names the call in a namespace the other never
reads — export's `turn_id` is `prompt.id`, one user turn, which a main-agent
request and the subagent it spawned can share (see `turn_id` below); local's
`turn_id` is `requestId`, one billed call — so matching on `turn_id` alone, as
the re-read rule above does, never catches this: the two routes' records for
the same real call never share that key, and a consumer that only guards
against the re-read case sums both. **Measured on a captured export fixture no longer in
this repository** (`otlp-logs-claude-code-subagent.json`, deleted with the export route it
described, a main-agent request and the subagent request it spawned): naively unioning
those two export records with what a local read of the same two calls would
produce doubles every figure — four `"request"` lines instead of two, every
token counter twice its true value.

**The fix is not a write-time match.** The sink is append-only (see "Where
records live"): a record already stored can never be corrected in place, only
reconciled by whatever reads it back. `billed_request_id` is the field that
makes the reconciliation possible — the one identifier measured so far that
both routes compute the same value for, for the same real call (see
`billed_request_id` below). A consumer building a session's true totals groups
`"request"` records sharing `tool`, `vendor_id` and `billed_request_id` and
treats them as one billed call: keep the group's `cost_usd` and four token
counters from whichever record carries `cost_usd` at all (on every tool
measured so far, that record's counters are also the complete ones for the
call), and take `step_attribution`/`step`/`step_plugin` from whichever record
resolved one, so a call seen by both routes still shows the export's money and
the local read's tool-stated step, never one thrown away for the other. A
record with no `billed_request_id` joins no group and is counted exactly as it
arrived — the same rule an unmatched `turn_id` follows for the re-read case.
`cost-report-contract.md` calls this the third of the double-count rules
`aidd telemetry report --json` has already applied.

**The same collapse also absorbed a retried OTLP delivery, while the receiver
still ran.** `/v1/logs` and `/v1/metrics` were received unconditionally —
nothing at write time recognized a redelivered payload, because OTLP delivery
is itself at-least-once and a receiver refusing a delivery it cannot prove is
a duplicate would risk refusing a real one. A redelivered `api_request` named
the same `billed_request_id` as the first delivery, so the group it joined on
read had two (or more) identical records instead of one, and the same "keep
one, never sum" rule that reconciles two routes reconciled two deliveries of
one route just as well. A day file written while the receiver still ran can
still hold this shape; a consumer reading one applies the same collapse.

**This protection required `billed_request_id`, and most exports never carried
one.** Measured while the route still existed, only Claude Code's export named
it (its `request_id` log attribute). Codex's and Copilot's exports were once
declared — `identityAttribute` was real, measured from a captured session —
but neither was ever measured carrying a `request_id`, or any counter at all
through this route; Cursor's and OpenCode's exports were never even declared
(`kind: "unmeasured"`), so the receiver never resolved an identity for either
and stored nothing from them regardless. A route with no `billed_request_id`
has no group to collapse into: a retried delivery for it is indistinguishable
from two real calls, and doubles every counter it carries. That was always a
latent gap, not an observed one, on any stored line — the one route ever seen
carrying real counters (Claude Code's) was also the one route that was
protected. A consumer reading a stored `"export"` line today reads it against
exactly the coverage measured while the route ran; no export will ever carry
`billed_request_id` beyond what is already on disk.

## Identity and joins

- **`tool`** names which AI tool produced a record, as a fact stated on the
  record itself. A consumer never infers the tool from the name of another
  field (`vendor_field`, `vendor_id`) — that attribute name differs by tool
  *and by route*: the same Claude Code session identifier is named `sessionId`
  when read locally and `session.id` when exported. Reversing the attribute name
  back into a tool identity works only until a tool reuses another's attribute
  name.
- **`vendor_id`** is that tool's own session identifier, as a string, in
  whatever form the tool itself uses it — a UUID for Claude Code and Codex, an
  OpenCode `ses_…` id, and so on. **`vendor_field`** names which attribute
  carried it (`sessionId`, `session.id`, `session_meta.id`, `sessionID`,
  `conversation.id`, `gen_ai.conversation.id`, depending on tool and route). Two
  records with the same `tool` and the same `vendor_id` describe the same real
  session, regardless of which route produced either one, since the identifier
  value itself is the tool's own and does not change between its local file and
  its export.
- **`project_id`** is the repository a session ran in, when it is known.
  On the export route it is set directly from the `aidd.project_id` resource
  attribute, with no join and no `project_field`. On the local-read route it
  is joined from the run journal's own `session_start` line, which already
  resolves `project_id` and `project_remote` for the repository the hook
  fired in — the same value never re-derived from wherever the reader
  happens to be standing. **`project_field`** names which of the journal's
  two fields the value came from, present only on a record joined this way:
  `"project_remote"` when the journal named a git remote (the same value for
  every checkout of one repository), `"project_id"` otherwise (a directory
  name, which can collide across machines). A record with neither field
  belongs to no known project — never guessed at from the current
  repository, and never dropped.
- **`turn_id`** is the tool's own identifier for one turn or request, when the
  tool's file or export can name one. It is the key local-read re-reads are
  matched on (above), but **it is not guaranteed unique to one billed request**:
  measured on the captured session above, a main-agent request and the subagent
  request it spawned share one `prompt.id` — two `"request"` lines, $0.1086 and
  $0.0519, both under the same `turn_id`. Do not use `turn_id` as a primary key
  for billed requests; use it only for the re-read match it exists for.
  **`turn_field`** names which attribute carried it.
- **`person_id`** is not a tool's own, uncontrolled user attribute. This sink
  once stored that as `user_id`, mapped straight from whatever `user.id` an
  export happened to carry, regardless of whether the person using the tool
  agreed to be named; that field is gone, and an export-provenance record now
  carries no identity of any kind. `person_id` is the opposite in every way
  that mattered: an identifier a person generated for themselves, on their own
  machine, opted into per person rather than defaulted on for a whole export.
  It is present only on a `provenance: "local-read"` record — the one route
  guaranteed to run as that person, on that machine — and never on an
  `"export"` record: no receiver exists any more to run as that person at
  all, and even while one did, it was never guaranteed to run on the
  identified person's own machine. `person_id` is never derived from `user_id`,
  a git author, an email, or a hostname, in either direction. See `person_id`
  and `person_display_name` below for what each carries and when.

## Joining a commit to the session that made it

Not a field of a record — it lives in git, and is the one link between what was
measured and what was produced.

`aidd telemetry on` installs a `prepare-commit-msg` hook. A commit written while
an AI session was running carries a trailer:

```text
AIDD-Session-Id: 33333333-3333-4333-8333-333333333333
```

The value is the running session's own identifier, resolved from the environment.
It is not a second identifier minted for this purpose, so a commit joins to its
records on an equality with no resolution step in between. That equality is
measured on both hosts that write a trailer — see "How far the join is measured"
below, which also names the one case still open.

Rules a consumer can rely on:

- **A commit no AI session made carries no trailer.** The hook reads the running
  session from the environment and writes nothing when it finds none. An absent
  trailer means "not attributable", never "attributable to nobody".
- **A merge or a squash carries none either**, whatever was running. Those commits
  bring in work that other commits already account for.
- **At most one per commit**, amend and re-run included.
- **What a commit already carries is never rewritten.** `aidd telemetry off`
  removes the hook, so commits made after it carry nothing while the history keeps
  what it has. Note it is that command which removes it, not the switch's value:
  a project whose `.aidd/config.json` is edited by hand to `enabled: false` still
  has the hook installed, and still trailers.
- **The trailer is not proof the session's records exist.** Turning the switch on
  installs the hook, and a session whose records were never read, or were removed
  with `aidd telemetry forget`, still leaves its trailer behind. A join that finds
  no records on the other side is an ordinary outcome.

### How far the join is measured, per host

**Claude Code — measured.** `CLAUDE_CODE_SESSION_ID` is the transcript filename,
and a session is resolved locally by `<sessionId>.jsonl`, so the trailer's value
and the record's `vendor_id` are the same string.

**Codex — measured, on two real sessions.** A fresh session and a resumed one
were run on 2026-09-02. Both reported the same `CODEX_THREAD_ID`, and the resume
wrote **no second rollout** — it appended to the first. So the variable tracks the
rollout, and the rollout's uuid is exactly the `vendor_id` records carry: the
trailer's value equals theirs. An earlier version of this section warned that a
thread spans several rollouts; the resume disproved it.

One case is still open, and it is both narrow and bounded: 89 of 418 rollouts on
that machine are `thread_source: "subagent"`, where the rollout's own id and its
parent session's differ. Which of the two a subagent's `CODEX_THREAD_ID` carries
has not been captured.

What that can cost is worth stating, because it is less than it sounds: those two
identifiers are the subagent and the thread that delegated to it, so the trailer
names one or the other and both are the same piece of work. The worst reading is a
commit attributed to the parent thread rather than the delegated turn inside it —
coarser than intended, never another person's session and never a different tree.
Where the named rollout has no records read, the outcome is the ordinary
"a join that finds no records on the other side" named above.

Every ordinary session, fresh or resumed, joins exactly.

**Cursor, Copilot, OpenCode — no trailer.** Nothing was measured that names their
running session in the environment, so the hook finds nothing and writes nothing.
That is the same rule as everywhere else here: an unknown is never a guess.

The link the trailer closes is `execution → commit`. From there, `commit → pull
request → ticket` is the forge's own, and belongs to whoever reads it — this
framework neither writes nor resolves those.

## Step attribution

Every record states **how**, not just whether, its step is known, via
`step_attribution`: `"tool-stated"` (the tool itself reported the running
step, exact for that record), `"journal-interval"` (derived: the record's own
moment fell inside a step's start/end interval recorded by AIDD's run journal —
an inference, not a measurement), or `"unattributed"` (no step could be
determined by either route). `step_attribution` is always present; it is never
omitted, because an absent field here would read as "no step ran," which is
exactly the assertion nothing on a transcript or a journal can support.

`step` (the skill or step name) is present exactly when `step_attribution` names
a source that found one — absent, never a placeholder, when `step_attribution`
is `"unattributed"`. `step_plugin` (the plugin the step came bundled with) is
present only when `step_attribution` is `"tool-stated"` and the tool reported a
plugin alongside the step name; a journal interval never carries a plugin at
all, so `step_plugin` is absent whenever `step_attribution` is
`"journal-interval"`, even though `step` itself is present there.

**A journal interval ends where the journal says, and only a skill can say it.** The
interval runs from the `step_start` a skill's invocation wrote to the first of: a `step_end`
line naming that same skill, another `step_start`, or a `turn_end`. Only the first of those
is the end itself; the other two stand in for it. That matters because a `turn_end` is a
**pause** — a skill working across three prompts is credited with its first turn and nothing
after — and nothing any host emits says when a skill's work finished. Measured: a `Skill`
tool call's own `tool_result` returns about a tenth of a second after the call, which is the
dispatch, not the completion. So a skill declares its own end through a tool call it makes,
carrying `aidd:step-end <skill>` in that call's arguments, and the hook writes the line. An
end naming a skill the session never started closes nothing, and an end never closes a step
other than the one it names — a skill invoking another must not end it.

A step whose interval was closed by a stated `step_end` still reads `"journal-interval"`, not
a stronger value: the record was still placed by its moment falling inside a span, which is
the inference that value names. What the end changes is the span, never how the record met
it.

**`step_attribution: "unattributed"` does not mean "this request ran outside any
step."** Claude Code's own attribution field is omitted from its transcript both
when no skill was running and when the running Claude Code version predates the
field (it arrived around version 2.1.220). Measured across 40 real transcripts
and twelve versions, there is not one `null` value that distinguishes the two
cases — the field is omitted identically either way. A consumer that reads
`"unattributed"` as "confirmed to be outside any step" is asserting a fact the
data cannot support. Read it only as: no step could be determined for this
record, for whatever reason.

## Field reference

Every field below states its type, when it is present, what it means, and —
because an absent counter and a zero counter are different facts — what its
absence means.

### Always present

#### `sink_schema_version`
- **Type**: number.
- **Present**: always.
- **Meaning**: the wire format version this line was written under. Currently `2`.
- **If absent**: never absent on a well-formed line; a line missing it, or
  carrying a version a consumer does not recognize, should be set aside rather
  than parsed as if its shape were known.

Adding `person_id` and `person_display_name` was not a version bump: a
consumer built against version 2 that never wrote or read either field never
sees them, and neither changes what any field it already understood means —
the same rule `cost_report_version` follows in `cost-report-contract.md`.

Removing a field is neither of the two cases above — it neither adds
something ignorable nor changes what a kept field means. Whether it needs a
bump turns on whether a version has shipped: once a consumer could be reading
a real line, taking the field away without warning breaks it silently. Before
that, the risk does not exist — nobody can depend on a field no released
build ever produced. Removing `user_id` from the allowlist is not a version
bump for exactly that reason: `sink_schema_version` 2 has never been
released, so no consumer anywhere has read a real line carrying it. A day
file a pre-release build already wrote may still carry `user_id` on an old
line — the sink is append-only (see "Where records live") — and a reader
ignores it exactly as it would any other field it does not recognize.

#### `kind`
- **Type**: `"request"` or `"session"`.
- **Present**: always.
- **Meaning**: which of the two measurement kinds this line is — see "The two
  record kinds" above.
- **If absent**: never absent.

#### `provenance`
- **Type**: `"export"` or `"local-read"`.
- **Present**: always.
- **Meaning**: which route produced this line — a tool's OTLP export received
  over `/v1/logs` or `/v1/metrics`, or a tool's own file read directly from disk.
  Never defaulted, so a third route arriving later cannot be mistaken for one of
  these two.
- **If absent**: never absent.

#### `tool`
- **Type**: one of `"claude"`, `"cursor"`, `"copilot"`, `"opencode"`, `"codex"`.
- **Present**: always.
- **Meaning**: the AI tool that produced this record, stated directly — see
  "Identity and joins" for why this is never inferred from another field.
- **If absent**: never absent.

#### `vendor_id`
- **Type**: string.
- **Present**: always.
- **Meaning**: the tool's own session identifier — see "Identity and joins."
- **If absent**: never absent.

#### `vendor_field`
- **Type**: string.
- **Present**: always.
- **Meaning**: which attribute on the source payload carried `vendor_id` — the
  route as much as the tool (the same tool's own identifier can be named
  differently on its local file versus its export).
- **If absent**: never absent.

#### `step_attribution`
- **Type**: `"tool-stated"`, `"journal-interval"`, or `"unattributed"`.
- **Present**: always.
- **Meaning**: how the step (if any) was determined — see "Step attribution."
- **If absent**: never absent, deliberately — see "Step attribution" for why an
  absent field here would be misread.

### Identity and joins (conditional)

#### `turn_id`
- **Type**: string.
- **Present**: conditional — when the producing route can name a stable
  identifier for this specific turn or request. Present on most `"request"`
  lines measured so far (Claude Code, Codex, OpenCode). Never present on any
  export-route metric datapoint (no `"session"`-kind OTLP datapoint measured so
  far carries a turn identifier), but present on Copilot's local-read
  `"session"` line — its one-shot shutdown total is keyed on the shutdown
  event's own id, so a re-read can match it the same way a `"request"` line's
  is matched.
- **Meaning**: the tool's own turn/request identifier, and the key a local
  re-read is matched on. **Not guaranteed unique per billed request** — a
  main-agent request and the subagent request it spawns can share one `turn_id`
  on the export route. A `kind: "request"`, `provenance: "local-read"` turn is
  the one shape that can also be *corrected*, not just matched — see "A re-read
  appends unless matched" above; a `"session"`-kind turn (Copilot's) and an
  export-route turn are never corrected this way, only matched-and-dropped or
  left unmatched.
- **If absent**: this record's route has no stable per-record identifier to
  offer. It cannot be matched by a re-read, and will be appended again, once per
  read, for as long as the session's underlying file keeps being re-read — see
  "A re-read appends unless matched."

#### `turn_field`
- **Type**: string.
- **Present**: conditional — present exactly when `turn_id` is present.
- **Meaning**: which attribute on the source payload carried `turn_id`
  (`requestId`, `prompt.id`, `turn_id`, `id`, depending on tool and route).
- **If absent**: `turn_id` is also absent on this record.

#### `billed_request_id`
- **Type**: string.
- **Present**: conditional — measured so far only for Claude Code, on both routes:
  its export names it via the `request_id` attribute on the `api_request` log
  record, and its local transcript names it via `requestId` — the same
  attribute the local route already uses for `turn_id`. No other tool or route
  has ever been measured naming a billed call this way.
- **Meaning**: the tool's own identifier for one billed call, and, unlike
  `turn_id`, **guaranteed unique per billed request where it is present at
  all** — a main-agent request and the subagent request it spawns each carry
  their own. It exists so a consumer can collapse two records describing one
  real call — made when both an export and a local read are live for the same
  tool at once — into one, instead of summing both. See "One billed call,
  both routes" below. Never used for the local-read re-read match `turn_id`
  exists for, and never a primary key for anything beyond that collapse.
- **If absent**: this record's route has no stable per-call identifier to
  offer beyond `turn_id`, or the record's tool has never been measured
  carrying one. A record with no `billed_request_id` is never collapsed with
  any other — it is kept exactly as it arrived, the same rule an unmatched
  `turn_id` already follows for a local re-read.

#### `step`
- **Type**: string.
- **Present**: conditional — present exactly when `step_attribution` is
  `"tool-stated"` or `"journal-interval"`.
- **Meaning**: the skill or step name that was running.
- **If absent**: `step_attribution` is `"unattributed"` — no step name is known,
  which is a different fact from "no step was running." Never a placeholder
  string.

#### `step_plugin`
- **Type**: string.
- **Present**: conditional — present only when `step_attribution` is
  `"tool-stated"` *and* the tool reported a plugin name alongside the step.
- **Meaning**: the plugin the stated step came bundled with.
- **If absent**: either no step is known, the step came from a journal interval
  (which never carries a plugin), or the tool named a step with no plugin.

#### `project_id`
- **Type**: string.
- **Present**: conditional. On the export route: present when the emitting
  environment set a project identity (the `aidd.project_id` resource
  attribute). On the local-read route: present when the run journal's
  `session_start` line named a project for the session — see "Identity and
  joins."
- **Meaning**: the repository this session ran in.
- **If absent**: no project identity is known for this record — read as
  belonging to no known project, never attributed to a guess.

#### `project_field`
- **Type**: `"project_id"` or `"project_remote"`.
- **Present**: conditional — present only on a local-read record whose
  `project_id` was joined from the run journal; absent on an export-route
  record, whose `project_id` is set directly with no journal join to name a
  source for.
- **Meaning**: which of the journal's own two fields `project_id` came
  from — see "Identity and joins."
- **If absent**: either the record carries no `project_id` at all, or it
  does and came from the export route.

#### `person_id`
- **Type**: string.
- **Present**: conditional — present only on a `provenance: "local-read"`
  record, and only when the machine that read it holds a file recording that a
  person opted in. Never present on a `provenance: "export"` record.
- **Meaning**: a stable identifier a person generated for themselves and chose
  to attach, on their own machine — never derived from the export route's
  now-removed `user_id`, a git author, an email, or a hostname. Withdrawing
  removes the file this comes from; records already written keep whatever
  they were stamped with, since a day file is never rewritten in place (see
  "Where records live").
- **If absent**: nobody opted in on the machine that produced this record —
  the default for a fresh installation — or the record came from the export
  route, which never carries this field regardless of any opt-in.

#### `person_display_name`
- **Type**: string.
- **Present**: conditional — present only alongside `person_id`, and only once
  the person separately asked for a display name to be shown. Setting one
  never happens as part of opting in.
- **Meaning**: a name the person chose to show beside their figures. Never
  derived from `person_id`, and never used to derive it.
- **If absent**: either nobody opted in at all, or they opted in without ever
  setting a display name — the ordinary state, not an incomplete one.

#### `cli_version`
- **Type**: string, semver.
- **Present**: conditional — present only on a `provenance: "local-read"`
  record, stamped by `read-local-cost-use-case.ts` at the moment it stores the
  record, read through the same port `current-version-adapter.ts` already
  resolves the CLI's own version through. Never on a `provenance: "export"`
  record: that route's records were never produced by this CLI at all — a
  different process, a tool's own SDK, gone even earlier (see `provenance`
  above) — so there is no version of *this tool* to name on one.
- **Meaning**: which build of the AIDD CLI stored this record — never the
  framework's own version, which stored nothing, and never the plugin's,
  which stamps a different field on a different artefact (see
  `aidd_docs/runs/README.md`'s `plugin_version` on the `session_start` line).
  Comparing this field across two records is a real answer to "did this
  figure change when I upgraded" in a way neither of the other two versions
  can be, since it alone names what actually computed and wrote the line.
- **If absent**: the record was stored by a build of this CLI before this
  field existed. Reads as an unknown version, never as the current one or any
  other guess — inventing a default here would make an upgrade comparison
  silently wrong in the one place a version exists to serve it.

### Cost and token counters (conditional)

#### `cost_usd`
- **Type**: number, US dollars.
- **Present**: conditional. On `"request"` lines: present on every
  export-route record (a log record without `cost_usd` is not a billed request
  and is never turned into a record at all) and **never** present on a
  local-read record for any tool measured so far — no local reader has
  captured a billed amount from a tool's own file. On `"session"` lines:
  present on exactly the one (of six) datapoint lines per flush that carries
  the cost measure.
- **Meaning**: the billed amount for this request, or this flush window's delta.
- **If absent**: on a local-read `"request"` line, this route cannot see a
  billed amount for this tool at all — see the coverage table. On a
  `"session"` line, this is one of the other five datapoints in the flush, not
  the cost one.

#### `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`
- **Type**: number.
- **Present**: conditional, and independently per field. On `"request"` lines:
  Claude Code (both routes) reads all four together or none — a partial
  `usage` object yields no record at all, rather than a record with a missing
  counter silently read as zero. Codex reads each independently: a counter a
  turn never reported (Codex sometimes omits `cache_write_input_tokens`
  entirely, rather than sending zero) stays unset on that record rather than
  being summed in as a fabricated zero. On `"session"` lines: exactly one of
  these four fields is present per line — see "One line per datapoint, never
  merged" — the other three, plus `cost_usd` and `active_time_s`, are absent on
  that same line.
- **Meaning**: token counts for the request or the flush delta, normalized to
  mean the same thing across tools (OpenAI's Responses API convention makes
  Codex's raw `input_tokens` *inclusive* of its cached figure; this field
  subtracts the cache figure out, matching Claude Code's already-exclusive
  convention).
- **If absent**: this specific counter has no known value for this record — a
  fact distinct from a stored `0`, which means the tool reported the counter
  as exactly zero.

#### `model`
- **Type**: string.
- **Present**: conditional — present when the producing route names a model
  for this record (Claude Code, on both routes and both kinds; Codex, on
  `"request"` lines via its own `turn_context`).
- **Meaning**: the model identifier the tool itself used, unmodified.
- **If absent**: this route did not carry a model name for this record.

#### `effort`
- **Type**: string.
- **Present**: conditional — present when the route carries it (Claude Code,
  both routes; Codex, local read).
- **Meaning**: the tool's own effort/reasoning-level setting for the request.
- **If absent**: not carried by this tool's route.

#### `speed`
- **Type**: string.
- **Present**: conditional — measured so far only on Claude Code's export
  route.
- **Meaning**: the tool's own speed tier for the request.
- **If absent**: not carried by this tool's route.

#### `query_source`
- **Type**: string.
- **Present**: conditional — measured so far only on Claude Code's export
  route (values seen: `"main"`, `"sdk"`, `"agent:builtin:general-purpose"`).
- **Meaning**: what originated the request within the tool (its own
  main loop, its SDK, a named built-in agent).
- **If absent**: not carried by this tool's route.

#### `agent_name`
- **Type**: string.
- **Present**: conditional — present when the record is a subagent's own
  request. On Claude Code: set from the export's `agent.name` attribute, and
  from the local transcript's `attributionAgent` field when the transcript
  line is itself marked as a subagent line (`isSidechain: true`).
- **Meaning**: which named subagent made this request.
- **If absent**: for Claude Code, this was the main agent's own request, not a
  subagent's. For every other tool measured so far, this field is never set at
  all — its route does not name subagents as a concept, so its absence there
  says nothing about whether one ran.

#### `prompt_id`
- **Type**: string.
- **Present**: conditional — Claude Code only, and only where its transcript
  lets the prompt be resolved.
- **Meaning**: the prompt this billed call belongs to. A billed call and the
  prompt that caused it never share a transcript line: measured on a real
  810-record session, zero lines carry both `requestId` and `promptId`, only
  `type: "user"` lines carry the second, and all 209 lines bearing counters
  reach one by following `parentUuid` — three hops in the median. The reader
  walks that chain and stores what it finds.
- **Why it exists**: the run journal writes the same identifier on `step_start`
  (Claude Code hands its hooks `prompt_id`, stored there under the name
  `turn_id`). Matching the two joins a step to a record exactly, rather than
  inferring it from which interval each moment happens to fall in — the only
  route that stays true when two tasks advance at once, since two prompts remain
  two prompts however their moments overlap. Two tasks inside **one** prompt stay
  indivisible: a billed amount cannot be split without inventing a ratio.
- **If absent**: the chain reached no line naming a prompt — a transcript
  truncated mid-write, or a host whose files carry no such identifier, which is
  every tool but Claude Code today. Never read as "no prompt ran".

#### `prompt_skill`
- **Type**: string.
- **Present**: conditional — Claude Code only, and only where a `Skill` call was
  made inside the record's own prompt.
- **Meaning**: the skill that call invoked. The same fact the run journal writes
  as `step_start`'s `turn_id`, read from the transcript instead of from a hook.
  The first call wins where a prompt made several: a prompt that invokes two
  skills invoked the second from inside the first, and it is named for the work
  it began.
- **Why it exists**: the report never re-reads a transcript — it reads this sink
  and the journals beside it — so an observation only a transcript holds has to
  be written down when it is read or it is gone. It names a step for a session
  the journal never saw, which is every session that ran before the hook was
  installed. Measured on one machine: 28 such prompts across 22 days, 318 records
  named by that route and by nothing else.
- **Scoped to one transcript**: Claude Code writes a session's subagents to their
  own files, and a prompt is often spread across several — measured on one
  machine, 1,038 of 5,564 prompts appear in more than one file. A record names the
  first skill invoked inside its prompt *in the file it sits in*. A subagent that
  invoked its own skill did that work under that skill; merging the files first
  would have to pick one answer for both, and neither is true of both.
- **Not a duplicate of `step`**: that one reads `attributionSkill`, which Claude
  Code writes per message — exact where it appears and sparse where it does not.
  Measured inside the window one skill demonstrably ran: 142 lines carry counters
  and 20 carry that field. Its absence is therefore not the tool saying no skill
  ran, and naming the skill a prompt invoked contradicts nothing it states.
- **Never a judgement**: which step a record belongs to is derived fresh on every
  report, from this and from the journal together. The journal wins where both
  name a skill for the same prompt — it was written by a hook the host fired,
  where this is read back afterwards.
- **If absent**: the record's prompt invoked no skill, the chain reached no
  prompt at all, or the tool is not Claude Code. Never read as "no skill ran".

#### `duration_ms`
- **Type**: number.
- **Present**: conditional — measured so far only on Claude Code's export
  route.
- **Meaning**: the request's own wall-clock duration, in milliseconds.
- **If absent**: not carried by this tool's route.

#### `active_time_s`
- **Type**: number.
- **Present**: conditional — the field target of exactly one `"session"`-kind
  metric measure, measured so far only for Claude Code
  (`claude_code.active_time.total`). Never present on any `"request"` line, on
  any tool.
- **Meaning**: seconds of active engagement Claude Code measured during this
  flush window — not wall-clock time, and not a per-request figure.
- **If absent**: no `"request"` line carries this at all — it exists solely as
  a `"session"`-kind measure; on a `"session"` line, this is one of the other
  five datapoints in the flush, not the active-time one.

#### `event_timestamp`
- **Type**: string, ISO 8601.
- **Present**: on every route measured so far, from its own source:
  - **Export**, both kinds: the OTLP record's own `timeUnixNano` (nanoseconds
    since the epoch, converted here to milliseconds). The `event.timestamp`
    attribute is read in preference when a payload carries one, but no captured
    payload ever has.
  - **Claude Code, local**: the transcript line's `timestamp` field.
  - **Codex, local**: the turn's own *start*, from the `turn_context` event —
    not a moment inside the turn. A record spans a whole turn, so a moment
    inside it would claim a precision the record does not have.
  - **OpenCode, local**: the message's `time.created`, in epoch milliseconds.
    Not `time.completed`, which is absent on some counted messages — a field
    that sometimes means "started" and sometimes "finished" is worse than one
    that always means the same thing.
- **Meaning**: when the work this record measures happened. Two consumers rely
  on it and they are separate: attributing a record against a run-journal step
  interval when `step` is not already tool-stated, and placing the record in a
  reporting period.
- **If absent**: two things become impossible, and neither may be substituted
  for. The record can no longer be attributed via a journal interval (only via
  a tool-stated `step`, if one exists), so it falls back to
  `step_attribution: "unattributed"`. And it belongs to **no period**: the only
  other moment available is the day file it was appended to, and that is when
  the record was received, not when the work ran — a session read locally days
  after it happened lands in the day file for the day it was *read*. A consumer
  reports such records as undated; it never places them by their day file.

#### `event_sequence`
- **Type**: number.
- **Present**: conditional — measured so far only on Claude Code's export
  route.
- **Meaning**: a monotonic counter the tool emits alongside its events.
- **If absent**: not carried by this tool's route.

## Per-tool coverage

Coverage is not uniform across tools, and it is not uniform across routes for the
same tool. A tool absent from one route is not a zero for that route — it is
"not covered," and a consumer should print it that way rather than infer a zero
from silence.

| Tool | Export route (removed — historical only) | Local-read route |
| ---- | ------------- | ------------------ |
| **Claude Code** | Was declared and measured: full request-level counters via `/v1/logs`, plus the six `"session"`-kind delta metrics via `/v1/metrics` every 10 seconds. `cost_usd` was only ever available through this route — no local file carries it. Also the only route ever measured naming `billed_request_id` (its `request_id` attribute). | Declared and measured: complete token counters per assistant message, keyed on `requestId`. Step is stated by the tool itself (`attributionSkill`), exact per message — the strongest attribution any tool or route offers. No `cost_usd`. Also names `billed_request_id` (the same `requestId`). **The one tool ever measured by both routes at once**: while the export route still ran, both routes could append a record for the same billed call under two different `turn_id`s (`prompt.id` there, `requestId` here) — a consumer reading a day file spanning that period still collapses on `billed_request_id` before summing, or every figure doubles. See "A third way to double count." |
| **Codex** | Was declared (`conversation.id` measured, zero-token, to verify the identifier only). Turn identifier and any metrics export stayed unmeasured — no counters, no cost, ever flowed through this route. | Declared and measured: complete counters per turn, keyed on `turn_id`, from the rollout's `token_count` events paired with the preceding `turn_context`. A turn read while its session is still running is stored with whatever counters had arrived so far, and corrected — never edited, a second line — once a later read brings a larger reading of the same `turn_id`; see "A re-read appends unless matched." No tool-stated step — attribution is only ever a run-journal interval, or unattributed. No `cost_usd`. |
| **OpenCode** | Unmeasured — no export payload has ever been captured for this tool. | Declared and measured, via `opencode export <sessionID> --sanitize`: counters per request (message), keyed on the message's own `id`. No established join to a run-journal entry — no captured hook or plugin payload has ever carried OpenCode's own session identity, so nothing exists to join on; these figures answer only what a session consumed, alone. `info.cost` is deliberately never read: it is `0` in every message captured, and its denomination (which currency, computed vs. billed) has never been established — a figure whose meaning is unknown is worse than an absent one. Records carry `event_timestamp` from the message's `time.created`, so they can be placed in a period; step attribution stays out of reach regardless, since there is no join to a run journal to attribute against. |
| **Copilot** | Was declared (`gen_ai.conversation.id` measured, zero-credit, to verify the identifier only) — but that attribute lived on the `invoke_agent` *span*, not on a log record or a metric, and the receiver only ever listened on `/v1/logs` and `/v1/metrics`. Limited to those two paths, it never saw the one attribute that identified a Copilot session, so this route yielded nothing in practice for as long as it existed. | Supported at **session** granularity only: `session.shutdown` in `~/.copilot/session-state/<id>/events.jsonl` carries input, output, cache read and cache write together, once, for the whole session. Nothing in its files counts a single request, so it yields a `session` record and never a `request` one, and no amount can be placed inside a step. Read `tokenDetails`, never `usage` — the latter is inclusive of cache writes where every other reader's input is exclusive. No model is stamped: `currentModel` names the session's last model, not the one that spent. Separately, its file's own `cost` field is denominated in premium requests, not currency, so it could not be treated as `cost_usd` even where it is present. |
| **Cursor** | Was unmeasured — no payload was ever captured. Cursor's own documentation names `cursor.conversation.id`, but a name read from documentation is a guess, and enabling that export to verify it was a team setting on an Enterprise plan, in beta, that nobody outside a Cursor admin could turn on — so it stayed declared unmeasured rather than declared from an unverified guess. | Unsupported (probed): Cursor writes no token count in any file it produces — there is nothing on disk for a local reader to find. |

Cursor was the one tool uncovered by both routes even before the export route
was removed: its export was never enabled to measure, and its local files
carry nothing to read.

### Attributing records to a task

A record carries no task identity, on any route. A task is derived by whatever
reads the records, from two kinds of line the run journal records beside them.
That derivation is deliberately not stored: a conclusion frozen at write time
cannot be revised, while a derivation re-runs over every past session the day
it changes.

**A written file.** The journal hook reads a written path from the tool's own
hook payload, and only Claude Code's carries one in a readable form: Copilot's
and Cursor's were never captured doing so, and Codex writes through an
`apply_patch` command string that would have to be parsed rather than read. A
session whose journal names a written path this way belongs, as a whole, to
whatever task that path resolves to.

**A declared ticket.** `task_declared` records that a tool call's own
arguments named a file under a task folder — the same move `step_start`
already makes for which skill is running, and it asks nothing of a payload's
shape. It reaches every host the journal hook dispatches a tool-call event
for, which today is every declared host, OpenCode included as of 2026-08-31:
a bounded measurement (three further sessions, varying the model) found that
a completed tool part's own arguments do reach its plugin's `event` hook, and
`hooks/opencode-plugin.js` joins one the same way every other host's own hook
already does — see `scripts/__tests__/fixtures/README.md`, "OpenCode's tool
part," for what was run and what arrived. A declaration is an interval, not
a whole-session fact — it opens where the tool call happened and
closes at whichever of a later declaration or a turn boundary comes next, or,
left open, at the last moment that session's journal actually recorded. Only a
record whose own moment falls inside that interval belongs to the task by
this route; the rest of the session falls back to whether it wrote into the
folder, exactly as before.

A session on a tool that produces neither kind of line is attributable to a
**period** and, where a journal covers it, to a **step** — but never to a
task. A consumer prints that as a limit of the tool, exactly as it prints "not
covered": a session with no task is not a session that touched nothing.

The Copilot denomination is measured, though not from anything in this
repository — it comes from reading that tool's own session files, and is
recorded here so the claim is auditable rather than taken on trust. Across
fourteen local sessions, `modelMetrics.<model>.requests.cost` sits at `0.33`
for every single-request `claude-haiku-4.5` session while `totalNanoAiu`
ranges from 2.04 to 2.95 billion and output ranges from 46 to 154 tokens;
a five-request `gpt-5-mini` session reads `0`. The figure tracks request
count times a per-model multiplier and is invariant to consumption, which is
what makes it premium requests rather than currency.

## Consuming a session correctly

To compute one session's true totals from a set of stored records:

1. Group records by matching `tool` and `vendor_id` — that pair names one real
   session, regardless of which `provenance` produced any individual record.
2. Within that group, collapse every `kind: "request"`, `provenance: "local-read"`
   record sharing a `turn_id` into the one carrying the largest `input_tokens` +
   `output_tokens` + `cache_read_tokens` + `cache_creation_tokens` — never a sum
   of the group, which would state a combination of counters the tool's own file
   never actually reported together. This is what a still-open turn re-read more
   than once (Codex, so far) leaves behind — see "A re-read appends unless
   matched." Restricted to `kind: "request"` and `provenance: "local-read"`: a
   `"session"`-kind turn (Copilot's) is a one-shot total with nothing to
   collapse, and an export-route `turn_id` is a prompt id several distinct
   billed calls can share, so applying this step there would merge them.
3. Then collapse every `kind: "request"` record sharing a `billed_request_id`
   into one before summing anything — see "A third way to double count: one
   billed call, seen by both routes." A record with no `billed_request_id` is
   never collapsed with another. Order between steps 2 and 3 does not matter —
   the two key on disjoint fields — but doing step 2 first means a still-open
   local-read turn is already down to one record before it is ever compared
   against the export route's record for the same call.
4. Sum `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, and
   `cache_creation_tokens` from the collapsed `kind: "request"` records in that
   group only. Never include `kind: "session"` records in this sum.
5. Sum `active_time_s` from `kind: "session"` records in that group only — no
   `"request"` record carries it.
6. Do not key anything else on `turn_id` beyond what it is documented for here:
   it is a write-time match-and-correct key for local-read re-reads, not a
   unique identifier for a billed request. `billed_request_id`, not `turn_id`,
   is what step 3 above collapses on, precisely because `turn_id` lacks that
   guarantee.
7. Where a tool's row above says a route is not covered, or covered without an
   amount, report that plainly rather than defaulting the missing figure to
   zero.
