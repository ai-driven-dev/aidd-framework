# Metrics contract

This is the contract for `TelemetrySinkRecord`, the one shape every AI-tool telemetry
line takes once it reaches storage. It is written for a consumer outside this
repository — a pricing service, an aggregator — that needs to price and attribute a
session's usage without reading this repository's source. Everything a correct
consumer needs is below: the file layout, every field's meaning and presence
condition, the two ways a naive reader double counts, and what each tool can and
cannot supply.

## Where records live

Records are appended as JSON Lines, one JSON object per line, to a UTC-day file:

```
~/.config/aidd/telemetry/YYYY-MM-DD.jsonl
```

or under `$AIDD_USER_CONFIG_DIR/telemetry/YYYY-MM-DD.jsonl` when that environment
variable is set. A day file is append-only for its whole life — lines are never
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

**Measured on one captured session** (Claude Code, `session.id` =
`22177147-d8cb-4ee1-976f-0ef82bd62491`, captured 2026-08-20):

| Source                                         | Kind        | Lines | `cost_usd` total |
| ----------------------------------------------- | ----------- | ----- | ----------------- |
| `otlp-logs-claude-code-subagent.json` fixture   | `"request"` | 2     | **$0.1605**        |
| `otlp-metrics-claude-code.json` fixture         | `"session"` | 1 (of 6) | **$0.0151**     |

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
the moment the tool appends anything else to that same record). A candidate whose
`turn_id` is already stored is not written again.

**This match requires a `turn_id`.** A candidate with no `turn_id` cannot be
matched against anything, and is appended again on every read that sees it — by
design, not by omission: inventing an unstable key would be worse than leaving it
unmatched.

**Worked example**, mirroring the tested behavior of the local-read use case: one
turn's transcript line carries 10 input tokens and 20 output tokens, under
`turn_id: "req_1"`. A first read appends it — 30 tokens stored. The session
continues and the same transcript file is read again (a re-read, same turn still
present in the file). Because `req_1` is already stored, the second read matches
it and stores nothing new. **Stored total after the second read: 30 tokens, not
60.** Had the same candidate carried no `turn_id`, the second read would have
appended it again, and the stored total would have become 60 tokens for one real
turn.

A consumer aggregating raw appends from the sink file without replicating this
`turn_id` match — for example, re-implementing a local reader against a tool's
own files rather than consuming this sink — will double, triple, or *N*-times
count any record whose route has no stable per-record identifier, once per read
of an active session.

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
- **`turn_id`** is the tool's own identifier for one turn or request, when the
  tool's file or export can name one. It is the key local-read re-reads are
  matched on (above), but **it is not guaranteed unique to one billed request**:
  measured on the captured session above, a main-agent request and the subagent
  request it spawned share one `prompt.id` — two `"request"` lines, $0.1086 and
  $0.0519, both under the same `turn_id`. Do not use `turn_id` as a primary key
  for billed requests; use it only for the re-read match it exists for.
  **`turn_field`** names which attribute carried it.

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
  lines measured so far (Claude Code, Codex, OpenCode); never present on any
  `"session"` line, since no metric datapoint measured so far carries a turn
  identifier at all.
- **Meaning**: the tool's own turn/request identifier, and the key a local
  re-read is matched on. **Not guaranteed unique per billed request** — a
  main-agent request and the subagent request it spawns can share one `turn_id`.
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
- **Present**: conditional — present when the emitting environment set a
  project identity (the `aidd.project_id` resource attribute, on the export
  route).
- **Meaning**: the AIDD project this session belongs to.
- **If absent**: no project identity was configured for this record — not "no
  project."

#### `user_id`
- **Type**: string.
- **Present**: conditional — present when the tool's export carries a user
  identity attribute (`user.id`).
- **Meaning**: the tool's own identifier for the user.
- **If absent**: no user identity was available on this record's route.

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
- **Present**: conditional — present when the producing route carries a
  per-record moment: Claude Code's export (`event.timestamp` attribute) and
  local transcript (`timestamp` field); Codex's local read, where it is the
  turn's own *start* (the `turn_context` event's timestamp), not a moment
  inside the turn — a record spans a whole turn, so a moment inside it would
  claim a precision the record does not have. OpenCode's local reader never
  sets this field.
- **Meaning**: the moment used to attribute a record against a run-journal step
  interval, when `step` is not already tool-stated.
- **If absent**: this record can never be attributed via a journal interval
  (only via a tool-stated `step`, if one exists); it falls back to
  `step_attribution: "unattributed"`.

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

| Tool | Export route | Local-read route |
| ---- | ------------- | ------------------ |
| **Claude Code** | Declared and measured: full request-level counters via `/v1/logs`, plus the six `"session"`-kind delta metrics via `/v1/metrics` every 10 seconds. `cost_usd` is only ever available through this route — no local file carries it. | Declared and measured: complete token counters per assistant message, keyed on `requestId`. Step is stated by the tool itself (`attributionSkill`), exact per message — the strongest attribution any tool or route offers. No `cost_usd`. |
| **Codex** | Declared (`conversation.id` measured, zero-token, to verify the identifier only). Turn identifier and any metrics export are unmeasured — no counters, no cost, flow through this route today. | Declared and measured: complete counters per turn, keyed on `turn_id`, from the rollout's `token_count` events paired with the preceding `turn_context`. No tool-stated step — attribution is only ever a run-journal interval, or unattributed. No `cost_usd`. |
| **OpenCode** | Unmeasured — no export payload has ever been captured for this tool. | Declared and measured, via `opencode export <sessionID> --sanitize`: counters per request (message), keyed on the message's own `id`. No established join to a run-journal entry — no captured hook or plugin payload has ever carried OpenCode's own session identity, so nothing exists to join on; these figures answer only what a session consumed, alone. `info.cost` is deliberately never read: it is `0` in every message captured, and its denomination (which currency, computed vs. billed) has never been established — a figure whose meaning is unknown is worse than an absent one. |
| **Copilot** | Declared (`gen_ai.conversation.id` measured, zero-credit, to verify the identifier only) — but that attribute lives on the `invoke_agent` *span*, not on a log record or a metric, and this receiver only listens on `/v1/logs` and `/v1/metrics`. A receiver limited to those two paths never sees the one attribute that identifies a Copilot session, so this route yields nothing in practice today. | Unsupported (probed, not merely unmeasured): its own file carries `outputTokens` per turn and nothing else — no per-request input figure exists on disk, so no per-request record can be built from it at all. Separately, its file's own `cost` field is denominated in premium requests, not currency, so it could not be treated as `cost_usd` even where it is present. |
| **Cursor** | Unmeasured — no payload has ever been captured. Cursor's own documentation names `cursor.conversation.id`, but a name read from documentation is a guess, and enabling the export to verify it is a team setting on an Enterprise plan, in beta, that nobody outside a Cursor admin can turn on — so it is declared unmeasured rather than declared from an unverified guess. | Unsupported (probed): Cursor writes no token count in any file it produces — there is nothing on disk for a local reader to find. |

Cursor is the one tool uncovered by both routes today: its export cannot be
enabled here to measure, and its local files carry nothing to read.

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
2. Sum `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, and
   `cache_creation_tokens` from `kind: "request"` records in that group only.
   Never include `kind: "session"` records in this sum.
3. Sum `active_time_s` from `kind: "session"` records in that group only — no
   `"request"` record carries it.
4. Do not key anything on `turn_id` beyond what it is documented for here: it is
   a write-time match key for local-read re-reads, not a unique identifier for
   a billed request.
5. Where a tool's row above says a route is not covered, or covered without an
   amount, report that plainly rather than defaulting the missing figure to
   zero.
