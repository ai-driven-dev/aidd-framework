# Cost report contract

**Read this if you are writing a skill, or anything else that reports on AIDD work.**
It describes what `aidd telemetry report --json` prints: one object, the same shape
whatever tool did the work, carrying both the figures and a statement of what each tool
could and could not supply.

> If instead you are building a **pricing service or an aggregator** that consumes stored
> records directly, read [`metrics-contract.md`](./metrics-contract.md) — the contract for
> one stored line. The two are deliberately different audiences, and picking the wrong one
> is expensive: the record contract makes you responsible for the three double-count rules
> (the two record kinds, a local re-read — including correcting, never summing, a still-open
> turn a later read completes — and one billed call once seen by both an export and a local
> read at once, for a stored line old enough to predate the export route's removal), and
> re-read deduplication. This one has already applied all four.

**Never reconstruct these figures from stored records.** One computation in one place is
the whole point: two ways of computing a number is how they start disagreeing.

## Getting the object

```bash
aidd telemetry report --json
aidd telemetry report --from 2026-08-01 --to 2026-08-31 --json
aidd telemetry report --task 2026_08/2026_08_21_cost-reporter --json
aidd telemetry report --project acme/widgets --step aidd-dev:02-implement --json
```

Prints one JSON object on stdout and exits `0`, including when the period holds nothing.
A period that is not a period — `--from notaday`, `--days 0` — exits `1` naming the flag.
A filter naming a value nothing ever recorded still exits `0` — see **Filters** below;
only a malformed period is a usage error.

## Filters

Six dimensions exist: day, project, task, step, model, tool — an axis says how to
*group*, a filter says what to *keep*, and every one of them works as either. The period
(`--from`/`--to`/`--days`) is the day filter; `--task` already existed; `--project`,
`--step`, `--model` and `--tool` are the other four, each optional:

```bash
aidd telemetry report --project acme/widgets --json          # this project, whole period
aidd telemetry report --project acme/widgets --step aidd-dev:02-implement --json
```

**Filters compose by `and`, never by a query language.** Two given narrow to their
intersection; there is no `or` and no parentheses — the moment a report needs one it has
stopped being a report. Filtering and grouping on the same dimension (`--project X` next
to a `by_project` breakdown that then holds one row) is a legal, boring answer, not an
error.

**"Axis" above means a breakdown, not a flag.** Every `by_*` array is always present in
the `--json` object, whatever filters were given — grouping by any of the six dimensions
needs no separate flag; reading the matching array is the axis. `by_task` groups by the
same declared intervals `--task` filters on, never by a session's whole-session
written-file inference — see **`by_task`** below. `by_person` is a seventh axis with no
matching filter flag at all — see **`by_person`** below — grouping by who ran the work,
never a way to keep only one person's records. `by_backlog` is an eighth, also with no
filter of its own — see **`by_backlog`** below — regrouping `by_task`'s own rows one level
up, by what each task's folder declares. `by_flow` is a ninth, also with no filter of its
own — see **`by_flow`** below — grouping by which orchestrated run the journal's own step
sequence names, never a second capture. `by_agent` is a tenth, also with no filter of its
own — see **`by_agent`** below — grouping by which agent ran, the main thread carrying its
own row rather than an absence. `by_prompt` is an eleventh, also with no filter of its own —
see **`by_prompt`** below — grouping by the prompt that caused the work, the one breakdown
no host limit can leave empty. `aidd telemetry report` also takes
`--axis <name>` (`total`, `day`, `step`, `model`, `agent`, `prompt`, `task`, `backlog`,
`flow`, `tool`, `project` or `person`), which picks one of those arrays and renders it alone as a small
pasteable artefact instead of the whole object — a convenience for copying one figure out,
not a second way to group. Every figure `--axis` can show is already in the plain `--json`
object; only the one-artefact-at-a-time rendering is what it adds. A name outside the twelve
is a usage error naming the valid list (`Error: Unknown axis 'bogus'. Expected one of:
total, day, step, model, task, backlog, flow, tool, project, person.`, exit `1`), not a
silently empty artefact. Given both flags at once, `--json` wins and `--axis` is ignored, never the
reverse.

**A filter matching nothing names itself**, in `empty_selection`, rather than the object
quietly reporting the same shape a genuinely idle period would:

```jsonc
"empty_selection": { "filter": "project", "value": "acme/ghost", "known": false }
```

`known: false` means no record this call could see ever carried that value — a project
nobody ever worked in. `known: true` means the value is real, just idle in this selection;
an optional `"combination": true` alongside it means the value matches something on its
own, and it is the intersection with an already-applied filter that emptied the
selection, not the value itself. `empty_selection` is **never** present for a period that
is genuinely idle — that case is a row of zeros, because the zero is true; this field
exists only for the different case, where a filter is what emptied it.

The known/unknown distinction is only as good as what a call could still see: a value
whose every record has since rotated out of the sink reads as `known: false`, the same as
one that never existed. It answers "did anything I can still read ever carry this", not
"did this ever happen".

**A model filter always drops a whole-session figure; a step filter usually does.**
`active_time_s` and a tool's `session_totals` come from `kind: "session"` records, and
those never carry a `model` — no reader stamps one on a session-kind record, on any tool
measured so far. Filtering by model is correct to exclude them: a model selection cannot
speak to a whole-session figure no model was ever attached to. A `step` is different: a
session record still gets one wherever its own moment happens to fall inside a journal's
`step_start` interval, the same attribution every other record gets — so a step filter
keeps a session record when that interval matches, and drops it otherwise. Either way the
number does not appear as `0` when dropped; it is simply absent, the same convention every
other "never observed" quantity in this object uses.

Adding `filters` and `empty_selection` was not a `cost_report_version` bump: a consumer
built against version 2 that never passes a filter never sees either field, and neither
changes what any field it already understood means.

## Determinism

**The same files and the same absolute period produce byte-identical output.** That holds
across repeated calls and across the order records happen to sit in on disk, which differs
between machines because a re-read appends.

It does **not** hold for `--days`, which resolves against today. `--days` is the human
shorthand; anything that stores or compares a figure should ask for `--from` and `--to`.
The object always reports the period **as it resolved**, absolutely, never as it was asked
for — so a figure taken from a `--days` call can still be cited by the days it covered.

## Versioning

`measurement_enabled` was added without a bump: a consumer built against version 4 that
never reads it sees every field it already understood mean exactly what it already meant —
"adding a field you may ignore" is the rule below, applied to the case that motivated
writing it down. It says whether this project's own switch is on right now; the sink the
figures above come from is scoped to this person, not to this project, so `false` beside a
real count is the ordinary case of reporting from a project whose switch never covered that
work, never a contradiction (see "Attributing records to a task" for the same scope split
elsewhere in this object).

Every object carries `cost_report_version`, currently `15`.

Bumped from `14` when `by_person`'s `resolution` gained a fourth value,
**`"this-machine"`**: the record carried no identifier of its own, and this machine has
declared an identity. It exists because `person_id` is written onto a record when the record
is *stored*, so whether one carries it depends on when the identity was declared relative to
when that record was read — never on the work. Measured on a live machine: 29,207 requests,
every one read by that machine's own `aidd`, and `by_person` could name none of them; the
same sink, the same identity file, answered differently depending on the order those two
things happened in. Declaring an identity now names the whole history rather than only what
follows. Sound because the sink has exactly one writer and every line it holds carries
`provenance: "local-read"` — a record in it was read by this machine's own reader. A consumer
that switched exhaustively on the three previous values must add this one; every row's
`totals` still reconciles to the period total.

Bumped from `13` when the reasons a `by_task` or `by_backlog` row can carry gained a
fifth, **`"precedes-journal"`**: this record's moment is older than the earliest moment its
own session's journal witnessed. Until then those records read `"precedes-declaration"`,
which asserts that the work named its task late — and measured on 2026-09-04, 96.2% of a
real period (28,570 of 29,207 requests) read that way while fewer than one in five hundred
of them had actually declared late. The population is ordinary, not an anomaly: reading a
resumed transcript stores the turns it inherited under the session that read them, dated
when each was *billed*, days before that session opened a journal. Keyed on the journal's
own earliest witnessed moment, the same field the `"inferred"` bound above already reads,
never on its `session_start` line. Decided before `"no-declaration"`, so a journal that
declared nothing *and* did not cover the record is named by the coverage fact. A consumer
that switched exhaustively on the four previous reasons must add this one; every row's
`totals` still reconciles to the period total.

Bumped from `12` when **`by_prompt`** joined the top-level breakdowns — the prompt that
caused the work, grouped by the turn each record came from. It is the one breakdown no host
limit can leave empty: every record the reader stores already carries its own turn, where
`by_step` depends on a host naming a skill and reads a few percent on a session whose real
cost sits in subagents. A row with no `prompt` is a record whose turn nothing named, placed
last like every other axis' remainder rather than dropped. A consumer that summed every
breakdown's `requests` against `totals.requests` has one more breakdown to sum.

Bumped from `11` when **`by_task`'s `attribution` stopped being always `"declared"`**. A
record no declaration covers is now named after the one task folder its session wrote into,
marked `"inferred"`, so one task can hold two rows — one per route — the same
`(name × attribution)` shape `by_task`'s neighbour `by_step` has always had. A consumer that
read `attribution` as a constant, or `by_task` as one row per task, misreads this version;
summing every row's `totals` still reconciles to the period total. Two bounds make the route
sound and both are load-bearing: a session that wrote into **two** task folders infers
nothing, since there is no reason to choose between them; and a record outside the span its
own journal witnessed infers nothing either — measured, a session whose journal was lost and
recreated witnessed four minutes while the sink held its records from seven days back, and
without that bound all seven days would have been attributed to a folder it touched today.
Nothing new is captured for this: `file_written` was already written by the hook at turn end.

Bumped from `10` when the reasons a `by_task` or `by_backlog` row can carry gained a
fourth, **`"no-journal"`**. It separates a fact about the read from a fact about the work:
until then, a record whose session had no usable run journal was given `"no-declaration"`,
which asserts that the session declared no task. Measured on
2026-09-04, running the report from a subdirectory of the repository put 100% of a period
into `"no usable task declaration in this session"` while every journal sat one directory
up, unread — the reader anchored at the process working directory and the hook that writes
a journal anchors at the repository root. The reader now anchors where the writer does, and
this reason covers what the anchor cannot reach: a project whose journals are on another
machine, a period read outside any checkout, a session whose journal was removed. A
consumer that switched exhaustively on the three previous reasons must add this one; every
row's `totals` still reconciles to the period total exactly as before.

Bumped from `12` when **`by_prompt`** joined the top-level breakdowns. It is the only
breakdown no host limit can empty: every other one depends on a capture that may not have
happened — a run journal, an identity file, a task declaration, a host that names the skill
it is running — while this one depends on a field the transcript reader resolves for itself,
by walking `parentUuid` back to the turn that caused the work. That is not the same as
complete: measured 2026-09-05 on one machine's sink, 845 of 30,714 records carry no
`prompt_id`, and all but one of them were stored by a reader that predates the resolution —
see **`by_prompt`** below. Nothing new is captured for it.
A row carries `started_at`, the earliest moment in that prompt, because a prompt id alone is
opaque — it is what a person greps for in their own transcript. The row for records that
named no prompt carries neither `prompt` nor `started_at`, is placed last rather than ranked
among the prompts, and holds the whole period on every tool but Claude Code, which is the
truth for a route whose files cannot say which turn caused what. A consumer summing every
breakdown's `requests` against `totals.requests` has one more to include.

Bumped from `9` when **`by_agent`** joined the top-level breakdowns. It exists because that
is where the spend is: measured on a live session, ten subagent transcripts held 432M of its
466M tokens, and every one of their lines names its agent (`attributionAgent`, 100% of
subagent tokens) where almost none names a skill (2.7%). That is why `by_step` can read a
few percent while a session's real cost sits elsewhere — the host names a skill on the main
thread alone, and no reader can invent one. `by_agent` needs no new capture: `agent_name` was
already on the record. A row with no `agent` is the main thread's own, never "no agent" — a
session starts there. On every tool but Claude Code the field is never set at all, so that
one row carries the whole period, which is the truth for a route that names no subagents.

Bumped from `8` to `9` when `attribution` gained a fourth value, `prompt-matched`.

Bumped from `7` to `8` when `by_flow`
joined the top-level breakdowns (a consumer summing every breakdown's `requests` against
`totals.requests` now has a seventh breakdown to include). `by_flow` groups by which
orchestrated run the journal's own step sequence already names — no skill declares that it
orchestrates, so which ones do is a fact this object's own reader declares once, never
matched from a plugin name — and needs no new capture: the same `step_start` lines
`by_step` already reads are read again, between whichever of them the declared set names.
Bumped from `6` when `by_backlog` joined the top-level breakdowns (a consumer summing every
breakdown's `requests` against `totals.requests` now has a sixth breakdown to include).
`by_backlog`
regroups `by_task`'s own per-record membership one level up, by what each task's own
folder declares (`aidd_docs/tasks/<task>/backlog-link.json`) — never a second notion of
which task a record belongs to, and resolved once per task rather than once per record.
Bumped from `5` when the row
`by_task` gives for a record that fell in no declared interval stopped being a single row
and became up to three, one per `reason` actually present in the period
(`"no-declaration"`, `"precedes-declaration"`, `"journal-silent"`, joined at version `11`
by `"no-journal"` — see "Attributing records to a task" and the `by_task` section
below). A consumer that read "the one row with no `task`" as a single, whole-period fact
would misread this version; summing every
row's `totals` still reconciles to the period total exactly as before, only the count and
identity of rows with no `task` changes. Bumped from `4` when `by_task`
joined the top-level breakdowns (a consumer summing every breakdown's `requests` against
`totals.requests` now has a fifth breakdown to include). `by_task` groups by the same
closed, declared intervals the pre-existing `--task` filter already reads — never a
second notion of when a task was running — and is unrelated to `task_attribution`, which
still exists only alongside a `--task` filter. Bumped from `3` to `4` when `by_person`
joined the top-level breakdowns and `read` gained `identity_unusable` (a consumer
summing every breakdown's `requests` against `totals.requests` now has a fourth breakdown to
include). `identity_unusable` was reshaped from a boolean into a named cause, and the field
it replaced (`person_mapping_unusable`, over a separate mapping file) was deleted, before
version 4 ever shipped — no second bump announces either change, since nothing has read
this version yet. Bumped from `2` to `3` when `by_model` gained a row with no `model`, for a
record neither reader that permits one could name (a consumer that read `row.model` as
always a string on every prior version would misread this one). Bumped from `1` to `2` when
`by_day` and `by_project` joined `by_step`, `by_model` and `by_tool` as top-level breakdowns.

**Set aside an object whose version you do not recognise rather than guessing its shape.**
The number is bumped when a consumer that understood the previous shape would misread this
one. Adding a field you may ignore is not a bump; changing what an existing field means is.

## The shape

```jsonc
{
  "cost_report_version": 15,
  "period": { "from_day": "2026-07-01", "to_day": "2026-07-31" },
  "measurement_enabled": true,                  // this project's own switch, right now — see Versioning
  "task": "2026_08/2026_08_21_cost-reporter",   // absent unless --task was given
  "filters": { "project": "acme/widgets" },     // absent unless a generic filter was given
  "empty_selection": { "filter": "project", "value": "acme/ghost", "known": false },  // absent unless a filter, not the period, emptied this selection
  "sessions": 1,
  "totals": { "requests": 2, "input_tokens": 13930, "output_tokens": 4377, "cache_read_tokens": 165632, "cache_creation_tokens": 0 },
  "active_time_s": 2820,                        // absent when no record carried it
  "by_step":    [{ "step": "aidd-dev:02-implement", "attribution": "journal-interval", "totals": {} }],
  "by_model":   [{ "model": "gpt-5.6-sol", "totals": {} }],  // a row with no "model" names none known
  "by_agent":   [{ "agent": "aidd-dev:executor", "totals": {} }, { "totals": {} }],  // a row with no "agent" is the main thread's own, never "no agent"
  "by_prompt":  [{ "prompt": "a-prompt-id", "started_at": "2026-07-01T09:00:00Z", "totals": {} }, { "totals": {} }],  // one row per prompt, largest first; the last row, undated, is every record that named none
  "by_tool":    [{ "tool": "codex", "coverage": "covered", "reason": "…", "capability": {}, "totals": {}, "session_totals": {} }],  // session_totals absent unless the tool has one (Copilot, today)
  "by_project": [{ "project": "acme/widgets", "totals": {} }],   // a row with no `project` names none known
  "by_task":    [{ "task": "2026_08/2026_08_21_cost-reporter", "attribution": "declared", "totals": {} }, { "reason": "precedes-declaration", "totals": {} }],  // a row with no `task` carries `reason` instead, naming which of five facts applies; up to five such rows
  "by_backlog": [{ "backlog": "ai-driven-dev/framework#661", "totals": {} }, { "declaration": "none", "totals": {} }, { "declaration": "unreadable", "totals": {} }, { "reason": "precedes-declaration", "totals": {} }],  // a row with no `backlog` carries `declaration` (a known task naming none, or one whose declaration could not be read) or `reason` (a record in no task at all) — never both, never neither
  "by_flow":    [{ "flow": "aidd-orchestrator:01-sdlc", "attribution": "journal-interval", "started_at": "2026-07-01T09:00:00Z", "totals": {} }, { "flow": "aidd-orchestrator:01-sdlc", "attribution": "journal-interval", "started_at": "2026-07-01T11:00:00Z", "totals": {} }, { "flow": "aidd-orchestrator:01-sdlc", "attribution": "tool-stated", "totals": {} }, { "attribution": "unattributed", "totals": {} }],  // two runs of the same skill are two rows, told apart by `started_at`; a `tool-stated` row is every run of that skill only the record's own tool named, so it carries no `started_at`; the last row is work that joined neither
  "by_day":     [{ "day": "2026-07-01", "totals": {} }],         // every day in the period, in order, gaps included
  "by_person":  [{ "resolution": "mapped", "person": "a-person-id", "identities": ["a-person-id", "a-machine-id"], "totals": {} }],  // mapped rows first, then every unplaced identity, then the one row for records carrying none
  "attribution": [{ "attribution": "tool-stated", "totals": {} }],
  "task_attribution": [{ "attribution": "declared", "totals": {} }],  // present only alongside "task"
  "read": { "undated_records": 0, "unreadable_lines": 0 }  // identity_unusable absent: the identity was read fine
}
```

### Totals

The same object appears as `totals` everywhere — at the top level and on every row.

| Field | Meaning |
| --- | --- |
| `requests` | Billed requests. Always present. |
| `cost_micro_usd` | Whole micro-dollars. Divide by 1,000,000 for dollars, at the moment of display and not before. |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens` | The four counters, disjoint — adding all four gives total tokens without counting anything twice. |

**An absent counter means never observed, which is not zero.** A tool whose files carry no
amount has an *unknown* cost, not a free one. Print "unknown", never `$0.00`.

**No amount reaches this object from a local read, on any tool, and no route can add a new
one going forward.** Claude Code's `cost_usd` only ever existed on its OTLP export, and
that route was removed — no code path in this repository can produce a new `"export"`
record. A stored one written before the removal can still be read (the sink is
append-only), so `cost_micro_usd` can still appear on this object for a period whose
history includes that data; it will never appear for work measured after the removal. If
you are reporting on locally-read sessions, you are reporting tokens; the rates that turn
them into money live outside this repository.

### Breakdowns

`by_step`, `by_model`, `by_tool`, `by_project`, `by_task`, `by_backlog` and `by_flow` are
ordered largest first, with a stable tie-break, so the biggest thing is the first thing you
read. Ordered by `cost_micro_usd` where a row has one, and by all four token counters
summed where it does not — never by `input_tokens` and `output_tokens` alone, which every
tool here dwarfs with cache. `by_task` places every row for what fell in no declared
interval last regardless of size, in `reason`'s own fixed order (`"no-journal"`,
`"precedes-journal"`, `"no-declaration"`, `"precedes-declaration"`, `"journal-silent"`) — the same convention
`by_person` gives its own no-identifier row, a reader sees tasks before the remainder, and
the remainder in the
same order every time. `by_backlog` places its own named rows first, then the row for a
known task declaring none, then the row for one whose declaration could not be read, then
every `reason` row in that same fixed order. `by_flow` carries no such tail: the row for
what fell in no flow interval sorts by size exactly like every named one, since there is
only ever one such row, never a reason to place last. `by_day` is the one exception: it is
chronological, one row per day the period spans — a series read out of order is not a
series, and a day nothing ran on is a row of zeros rather than an omitted day.

**Every breakdown sums exactly back to `totals`.** That is asserted, on integers, not
hoped for.

`by_step` is keyed by the step **and** the strength of its attribution: one skill reached
once from the tool's own statement and once from a journal interval is two rows, because
they are two different claims. A row with no `step` carries `attribution: "unattributed"`.

`by_project` carries a row with no `project` for a record stored before this field existed,
or whose session journal named none — never folded into a project the reader happens to be
standing in. A record's project comes from the run journal that covered its session, not
from wherever the report itself happens to run. An empty string is treated the same as no
project at all - never its own row.

`by_model` carries a row with no `model` the same way: both the Codex and OpenCode readers
permit a request with no model, and that record gets its own row rather than vanishing from
the breakdown while staying in `totals`.

### `by_task` — grouped by the closed interval a record falls in, never by a written file

`by_task` groups by exactly the same declared intervals `--task` already filters on (see
"Attributing records to a task"), and by nothing else: a record's own moment either falls
inside one session's closed interval, or it does not. It never consults a written path the
way the `--task` filter's own "inferred" route does, because that route decides for a whole
session at once and could place one session's records under two task rows at
once — the opposite of what a breakdown promises. A record's session is closed, sequential
intervals never overlap (see "Attributing records to a task"), so at most one interval
ever matches, and a record lands in exactly one row.

`attribution` is present, and always `"declared"`, on every row that carries a `task` —
travelling with the row rather than assumed, so a consumer never has to know which route a
breakdown reads. A row for what fell in no declared interval carries `reason` instead of
`task` and `attribution`, naming which distinct fact applies — never one label standing in
for all of them, and never more than one row per reason. The first names a fact about the
read, the rest facts about the work:

`attribution` says which route named the task, and is present only on a row that names one:

| `attribution` | What it means |
| --- | --- |
| `"declared"` | A `task_declared` interval in that record's session covers the record's own moment. |
| `"inferred"` | No declared interval covers it, its session wrote into exactly one task folder, and its own journal witnessed the moment. Weaker on purpose: the journal never said this record was that task's, only that the session touched that task and nothing else. |

| `reason` | What it means |
| --- | --- |
| `"no-journal"` | No usable run journal reached this record's session. Either none was read for it at all — the journals are on another machine, the period was read from outside any checkout, the session's own journal was removed — or one was read and could not be used, its `session_start` header torn, so nothing here knows which session its lines belong to. Never says the work declared nothing. |
| `"precedes-journal"` | This record's moment is older than the earliest moment its session's journal witnessed. Nothing declared late here; no journal existed yet. Reading a resumed transcript stores the turns it inherited under the session that read them, dated when each was billed — so this row is ordinarily the largest one in a period, and says nothing about how the work behaved. |
| `"no-declaration"` | This record's session never declared a task at all. |
| `"precedes-declaration"` | A task was declared, this record's moment falls inside what the journal witnessed, and some declared interval starts *after* it — a record before the session's very first declaration. Declared intervals run contiguously from each declaration to the next, so no gap exists between two of them. |
| `"journal-silent"` | A task was declared, every declared interval starts at or before this record's moment, and none of them reaches it — the journal's own declared coverage ran out before this record's moment did. |

Up to five such rows can appear in one period — one per reason actually present, never
fewer, and never two different gaps collapsed into one row the way a single, undifferentiated
"no declared interval" row used to read before `cost_report_version` `6`. A session whose
declaration could not be read produces the same `"no-declaration"` row a session that never
declared one does — there is no signal in the journal that would tell those two apart. Where
that possibility matters, `read.unreadable_lines` already carries it, for these rows as for
the whole object.

`by_task` sums to `totals.requests` exactly like every other breakdown.

**Alongside a `--task` filter, a row carrying `reason` can still appear, and is not a
contradiction of the header naming that task.** `--task` also keeps a session's records
through its own "inferred" route - the whole-session written-file fallback - for a record
no declared interval covers. `by_task` does not read that route at all, so that same
record lands in whichever `reason` row applies. Read the row as it is named: no *declared
interval* covers this record, not "this session never touched a task." Cross-check against
`task_attribution`'s own `declared`/`inferred` split when the distinction matters.

### `by_backlog` — grouped by what each task's own folder declares

`by_backlog` answers a different question than `by_task`: not "which task", but "which
backlog item" — the move from "this task cost X" to "issue #661 cost X". It regroups
`by_task`'s own per-record membership one level up: every record that `by_task` already
places under a named task is looked up once more, against that task's own
`aidd_docs/tasks/<task>/backlog-link.json`, and re-keyed on the item it declares. A record
`by_task` places in a `reason` row (no task at all) is untouched — it carries the identical
`reason` here, since there is no task to ask a question of in the first place.

A row with no `backlog` carries exactly one of `declaration` or `reason`, never both and
never neither:

| Field | Value | Means |
| --- | --- | --- |
| `declaration` | `"none"` | The record's task is known, but its folder declares no backlog item. A normal state, its own row. |
| `declaration` | `"unreadable"` | The record's task folder's declaration exists but could not be parsed. Its own row, costing that row's resolution and no figure — the record is still counted, here and everywhere else. |
| `reason` | one of `by_task`'s three | The record belongs to no task at all — see "Attributing records to a task". |

**Two tasks declaring the same item merge into one row — that is the point of this axis.**
A story delivered across two task folders, each with its own `backlog-link.json` naming the
same reference or the same path, reads as one row here, with both tasks' records folded
into it. Two tasks that each declare nothing do **not** merge into each other's figures by
virtue of both declaring nothing — they both land in the single `declaration: "none"` row,
which is one row precisely because "declares nothing" is one state, not because the two
tasks were confused for each other.

`by_backlog` sums to `totals.requests` exactly like every other breakdown — a damaged or
absent declaration changes how a task's records are grouped, never how many are counted.

### `by_flow` — grouped by the orchestrated run the journal's own sequence names

`by_flow` answers "what did this orchestrated run cost" — a level above a step and
unrelated to a task: `aidd-orchestrator:01-sdlc` running end to end is one flow, whatever
tasks or backlog items it touched along the way. Nothing new is captured for it. Skill
detection already writes a `step_start` line for any skill, orchestrating or not (the same
lines `by_step` reads), so a flow is *read* from that sequence, never declared by a hook:
one flow opens at an orchestrating skill's own `step_start` and closes at a `step_end`
naming that same skill, at the next orchestrating `step_start`, or — for a flow nothing ever
closes — at the journal's own last witnessed moment. A `turn_end` is a pause, not a close: a
flow spanning three prompts is exactly the case a `turn_end` used to cut short.

**Which skills orchestrate is declared, once, never matched from a plugin string.** No
skill's own frontmatter says it orchestrates, and more than one skill in this framework's
`aidd-orchestrator` plugin plausibly does. `flow-attribution.ts`'s `ORCHESTRATING_SKILLS`
names them explicitly, in both spellings the journal can carry for the same skill (an
argument-stated name and a bare directory name — see that module's own doc comment for
why both exist) — extending it for a project's own orchestrator is the one change adding a
new one to this axis ever needs.

A row's `flow` names the orchestrating skill, `attribution` says how that flow came to be
known, and `started_at` names the moment it opened. All three tell two rows apart: **two
orchestrated runs of the same skill in one session are two rows, never merged into one** —
an `attribution: "journal-interval"` row groups by the closed interval a record's own moment
falls inside, not by the skill's name alone, the same distinction `by_step` already draws
between a step reached by two different routes. A row with no `flow` at all, carrying
`attribution: "unattributed"`, is every record that joined neither an interval nor a stated
flow. There is no `reason` breakdown the way `by_task`'s remainder has one: a flow is read
from the same sequence whichever way a record misses it, so there is only ever the one fact
to state.

**A flow a record's own tool named is a flow.** A session resumed after its context was
compacted invokes nothing again, so no `step_start` hook fires and its journal opens no flow
— while the transcript goes on stating the step on every record it produces. A record no
interval covers, whose own `step_attribution` is `tool-stated` and whose `step` names an
orchestrating skill, joins a row for that skill carrying `attribution: "tool-stated"`. That
row has no `started_at`: it is a bucket drawn from however many runs of that skill the tool
named, and a name is not a run. Only the tool's own statement opens such a row — a
`journal-interval` step is an inference from the very intervals already checked, and a
`prompt-matched` one names a step rather than an orchestration.

**An interval wins over a stated flow, and the reason is granularity, not strength.** Where
a record falls inside an interval, that interval's row is the one it joins, even though its
tool stated the same skill. Elsewhere the preference runs the other way — `withStepBackfill`
prefers a tool-stated step over a journal-interval one — and the two are not in conflict,
because they answer different questions. There the question is *which skill*, and the tool
naming its own beats an inference from a moment. Here the question is *which run*, and only
an interval can say.

**A skill a person runs by hand while a flow is open counts inside it.** The journal cannot
tell a hand-run skill from one the orchestrator itself invoked — both write the identical
`step_start` line — so neither can this breakdown. State the limit rather than guessing past
it.

`by_flow` sums to `totals.requests` exactly like every other breakdown, and carries no
filter of its own — grouping only, the same as `by_person`.

### `by_prompt` — the axis no host limit can empty

Every other breakdown can read low for a reason that is about the capture, not the work: a
skill the host never named, a journal that was never written, an identity nobody declared.
This one groups on `prompt_id`, which the transcript reader resolves for every usage line it
stores — subagent lines included, by walking each file's own `parentUuid` chain back to the
turn that caused the work.

| Row | Means |
| --- | --- |
| `prompt` and `started_at` | one prompt, and the earliest moment measured inside it |
| neither field | every record no prompt could be resolved for |

**Read the second row as a real quantity, not a rounding error.** A sink accumulates across
reader versions, and a record's fields are fixed the first time its turn is stored: a record
written before this resolution shipped never gains a `prompt_id`, however often the sink is
read again. Measured 2026-09-05 on one machine's sink of 30,714 records: 845 carry none —
34 written before the CLI stamped a version, 810 by one session's reader before the
resolution shipped, and exactly one by the current reader, an assistant line whose
`parentUuid` chain reaches no line naming a prompt. Re-reading recovers little of it: 720 of
those requests name no line any transcript on disk still holds.

Ordered largest first, like every breakdown but `by_day`; the remainder row is placed last
rather than ranked, because a bucket drawn from many turns has no size comparable to a single
turn's. The text rendering prints the ten largest and then says how many it withheld — one
row per turn is unbounded where every other axis has a small vocabulary — while this object
always carries them all.

### `by_person` — three outcomes, never a merge

`by_person` resolves each record's `person_id` against the machine's own identity file
(`~/.config/aidd/identity.json`, or the platform equivalent — see `aidd telemetry identity`),
never against a git author, an email or a hostname. That file describes exactly one person:
its own `person_id`, how it was obtained (`origin`: `"minted"` here or `"adopted"` from
another machine), and every identifier added onto it with `aidd telemetry identity link`
(`also_me`). Each row's `resolution` is one of four:

| `resolution` | Means |
| --- | --- |
| `mapped` | The identifier is this machine's own person — its `person_id` or a member of `also_me`. `person` carries the canonical identifier, and `identities` carries every raw identifier behind the row, including that canonical one. |
| `unresolved` | The identifier is real, but the identity file does not cover it. `identities` carries that one raw identifier; `person` is absent. |
| `this-machine` | The record carried no identifier of its own, and this machine has declared an identity. `person` and `identities` carry that identity exactly as a `mapped` row does; the two are kept apart because they are different facts — `mapped` is the record naming a person this identity claims, this is the identity claiming a record that named nobody. |
| `none` | The record carried no identifier at all **and** no identity is declared — a different fact from `unresolved`: nobody opted in, rather than somebody did on a machine or tool this identity has not heard of. |

**Two raw identifiers one person declared merge into one `mapped` row; two unplaced
identifiers never merge into each other.** The identity file describes exactly one person,
so there is no shape in which two people could claim one identifier in the first place —
unlike a lookup table, nothing here can be edited into that state. Rows are ordered by how strong the claim is: `mapped`
first, then the one `this-machine` row, then every unresolved identity, then the one `none`
row last; largest first within each group.

`by_person` sums to `totals.requests` exactly like every other breakdown — a damaged or
undeclared identity changes how records are labelled, never how many are counted.

### `session_totals` — a session total, never a sum of requests

`by_tool` rows carry `totals`, summed from `kind: "request"` records, exactly like every
other breakdown in this object. A `by_tool` row can also carry `session_totals` — present
only for a tool whose own file yields one already-complete, per-session figure rather than
per-request records. Today that is Copilot alone: its `session.shutdown` event reports the
whole session's four token counters once, at the end, never per call.

**The two are never the same number and are never added together.** `totals.requests`
counts billed requests; a tool that has none of those (Copilot) reports `requests: 0` there
regardless of what `session_totals` carries. Read `session_totals` as its own answer to "what
did this session report", not as a fallback for a zero in `totals`. It carries no
`cost_usd` — the tool's own file states no billed amount for it, only a session's tokens.

`session_totals` is absent, never present-and-empty, for every tool that has none — reading
it as `{ "requests": 0 }` by default would claim a session total was measured and found
empty, which is a different fact from the tool never producing this figure at all.

### Attribution

`attribution` always has exactly three rows, in this order:

| `attribution` | Means |
| --- | --- |
| `tool-stated` | The tool named the running skill itself, on the line with the counters. Exact. |
| `journal-interval` | Derived from the interval between two boundaries the framework recorded. An inference. |
| `unattributed` | Neither source could say. |

A strength that accounts for nothing is present with `requests: 0`. That zero is a
measurement — the total is known and none of it came from that source.

**`unattributed` does not mean no step ran.** On at least one measured tool the two are
indistinguishable, so the stronger reading would be a fact nobody measured. Do not collapse
it into anything else, and do not call it a residual.

### Task attribution

`task_attribution` exists only alongside `task` — an unfiltered period carries no
per-record task identity to break down, so there is nothing here to say for it. Where
present it always has exactly two rows, in this order:

| `attribution` | Means |
| --- | --- |
| `declared` | The record's own moment fell inside an interval a flow explicitly opened, by naming a file under this task's folder in a tool call — a run journal `task_declared` line. Works on every tool the journal hook reaches, not only the one whose payload names a written path. |
| `inferred` | The record's session wrote into the task folder at some point, with no declared interval covering this specific record. The pre-existing, whole-session route. |

A source that accounts for nothing is present with `requests: 0`, the same convention
`attribution` uses. There is no `unattributed` row here: every record inside a `--task`
report already matched one of the two routes, or it would not be in the report at all.

**A declaration is bounded, never boundless.** It closes at whichever of a later
declaration or a turn boundary comes next; left open by a session that never closed it
(a crash, most often), it is capped at the last moment that session's journal actually
recorded — never at "still open," which would let one long-running session's later,
unrelated work read as this task's cost.

### Capability, per tool

This is the field that makes the contract the same across tools. **Branch on it. Never
infer a tool's limits from whether a number happened to be present** — a tool that cannot
supply an amount and a session that cost nothing look identical in the numbers.

```jsonc
"capability": {
  "local_read": { "token_counters": true, "amount": false, "tool_stated_step": false },
  "export": null,
  "journal_attributable": true,
  "task_attributable": false
}
```

| Field | Meaning |
| --- | --- |
| `local_read` | What that route was **measured** to supply. `null` means the tool declares no such route at all, which is not the same as a declared route supplying nothing. |
| `export` | **Always `null`, on every tool.** The export route was removed; no tool declares it any more, so there is nothing left to measure a shape for. Kept as a field, rather than dropped from the object, because dropping it would be a `--json` shape change for a capability that used to vary by tool and now simply never does. |
| `token_counters` | That route yields the four counters. |
| `amount` | That route yields a figure denominated in currency. Never a credit or a premium request. |
| `tool_stated_step` | The tool names the running step itself. A journal interval is not this. |
| `journal_attributable` | The run journal names this tool's sessions. **False means two things:** no step can come from an interval, *and* a read that sweeps the journal never reaches one of its sessions — so the tool can be perfectly readable and still report nothing until someone names a session by hand. |
| `task_attributable` | A session on this tool can be traced to the task it worked on — declared, inferred, or both. False only where the journal hook never reaches a tool call for this host at all, since a declaration needs a tool call's own arguments to read; true for every declared host today, OpenCode included as of 2026-08-31 (`registry-conformance.unit.test.ts` keeps this tied to the journal hook's own dispatch rather than typed in twice by hand). |

`coverage` is `"covered"` or `"not-covered"`, and `reason` says why when it is the second,
or what a covered tool's figures cannot be used for.

**Five silences, and only one is a zero.** A tool with `requests: 0` may be: not covered at
all (`coverage: "not-covered"`, read `reason`), covered but unreachable by the sweep
(`journal_attributable: false`), covered and reached and idle (a real zero), covered and
its reader failed (the human output says so; `aidd telemetry read` reports it per tool), or
covered and reporting only a `session_totals` figure — `requests: 0` there is correct and
permanent for that tool, not a silence to explain away.

### What the read could not do

```jsonc
"read": { "undated_records": 3, "unreadable_lines": 2, "identity_unusable": "unreadable" }
```

`undated_records` are records carrying no moment at all. They belong to **no** period —
the only other moment available is the day the line was stored, which is when AIDD heard
about the work rather than when it happened. `unreadable_lines` are lines no parser could
read.

**`undated_records` or `unreadable_lines` present or non-zero means your total is
partial.** Say so rather than presenting it as whole. `identity_unusable` is a different
kind of field and does not make a total partial: it names which of two causes kept this
machine's own identity from resolving records at all, `"unreadable"` for a declared
identity file that could not be read back, `"absent"` for no identity declared at all
(the ordinary state of anyone who has never opted in - not a degraded read). Either way,
exactly as `by_person`'s own section states, a damaged or undeclared identity changes how
records are labelled, never how many are counted: every record is still counted, in
`by_person` as `unresolved`, never as a reason to drop a figure. The field itself is
absent from `read` only when the identity was read back fine - `by_person`'s own rows are
what shows a resolved identity's effect.

## Filling it

Records reach storage when someone runs:

```bash
aidd telemetry read              # every session the run journal knows
aidd telemetry read --session <id>
```

A period that reports nothing usually means its sessions have not been read yet.

## Known limits

[The plugin README](../../plugins/aidd-telemetry/README.md) states what each tool can and
cannot be measured for, and why. Read it before explaining a missing figure.
