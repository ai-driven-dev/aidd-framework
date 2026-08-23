# Cost report contract

**Read this if you are writing a skill, or anything else that reports on AIDD work.**
It describes what `aidd telemetry report --json` prints: one object, the same shape
whatever tool did the work, carrying both the figures and a statement of what each tool
could and could not supply.

> If instead you are building a **pricing service or an aggregator** that consumes stored
> records directly, read [`metrics-contract.md`](./metrics-contract.md) — the contract for
> one stored line. The two are deliberately different audiences, and picking the wrong one
> is expensive: the record contract makes you responsible for the three double-count rules
> (the two record kinds, a local re-read, and one billed call seen by both an export and a
> local read at once — Claude Code today), and re-read deduplication. This one has already
> applied all four.

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
the object, on both `aidd telemetry report --json` and the plugin script, whatever filters
were given — grouping by any of the six dimensions needs no separate flag; reading the
matching array is the axis. The plugin script additionally offers `--axis <name>`, which
picks one of those arrays and renders it alone as a small pasteable artefact (a total, a
table) instead of the whole object — a convenience for copying one figure out, not a
second way to group. `aidd telemetry report` does not have this flag: passed `--axis`, it
refuses the option outright (`error: unknown option '--axis'`, exit `1`) rather than
silently ignoring it. Every figure `--axis` can show is already in the plain `--json`
object on both sides; only the one-artefact-at-a-time rendering is plugin-only.

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

Every object carries `cost_report_version`, currently `2` — bumped from `1` when `by_day`
and `by_project` joined `by_step`, `by_model` and `by_tool` as top-level breakdowns.

**Set aside an object whose version you do not recognise rather than guessing its shape.**
The number is bumped when a consumer that understood the previous shape would misread this
one. Adding a field you may ignore is not a bump; changing what an existing field means is.

## The shape

```jsonc
{
  "cost_report_version": 2,
  "period": { "from_day": "2026-07-01", "to_day": "2026-07-31" },
  "task": "2026_08/2026_08_21_cost-reporter",   // absent unless --task was given
  "filters": { "project": "acme/widgets" },     // absent unless a generic filter was given
  "empty_selection": { "filter": "project", "value": "acme/ghost", "known": false },  // absent unless a filter, not the period, emptied this selection
  "sessions": 1,
  "totals": { "requests": 2, "input_tokens": 13930, "output_tokens": 4377, "cache_read_tokens": 165632, "cache_creation_tokens": 0 },
  "active_time_s": 2820,                        // absent when no record carried it
  "by_step":    [{ "step": "aidd-dev:02-implement", "attribution": "journal-interval", "totals": {} }],
  "by_model":   [{ "model": "gpt-5.6-sol", "totals": {} }],
  "by_tool":    [{ "tool": "codex", "coverage": "covered", "reason": "…", "capability": {}, "totals": {}, "session_totals": {} }],  // session_totals absent unless the tool has one (Copilot, today)
  "by_project": [{ "project": "acme/widgets", "totals": {} }],   // a row with no `project` names none known
  "by_day":     [{ "day": "2026-07-01", "totals": {} }],         // every day in the period, in order, gaps included
  "attribution": [{ "attribution": "tool-stated", "totals": {} }],
  "task_attribution": [{ "attribution": "declared", "totals": {} }],  // present only alongside "task"
  "read": { "undated_records": 0, "unreadable_lines": 0 }
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

**No amount reaches this object from a local read, on any tool.** Claude Code's `cost_usd`
exists only on its OTLP export. If you are reporting on locally-read sessions, you are
reporting tokens; the rates that turn them into money live outside this repository.

### Breakdowns

`by_step`, `by_model`, `by_tool` and `by_project` are ordered largest first, with a stable
tie-break, so the biggest thing is the first thing you read. `by_day` is the one exception:
it is chronological, one row per day the period spans — a series read out of order is not
a series, and a day nothing ran on is a row of zeros rather than an omitted day.

**Every breakdown sums exactly back to `totals`.** That is asserted, on integers, not
hoped for.

`by_step` is keyed by the step **and** the strength of its attribution: one skill reached
once from the tool's own statement and once from a journal interval is two rows, because
they are two different claims. A row with no `step` carries `attribution: "unattributed"`.

`by_project` carries a row with no `project` for a record stored before this field existed,
or whose session journal named none — never folded into a project the reader happens to be
standing in. A record's project comes from the run journal that covered its session, not
from wherever the report itself happens to run.

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
  "export": { "token_counters": false, "amount": false, "tool_stated_step": false },
  "journal_attributable": true,
  "task_attributable": false
}
```

| Field | Meaning |
| --- | --- |
| `local_read`, `export` | What that route was **measured** to supply. `null` means the tool declares no such route at all, which is not the same as a declared route supplying nothing. |
| `token_counters` | That route yields the four counters. |
| `amount` | That route yields a figure denominated in currency. Never a credit or a premium request. |
| `tool_stated_step` | The tool names the running step itself. A journal interval is not this. |
| `journal_attributable` | The run journal names this tool's sessions. **False means two things:** no step can come from an interval, *and* a read that sweeps the journal never reaches one of its sessions — so the tool can be perfectly readable and still report nothing until someone names a session by hand. |
| `task_attributable` | A session on this tool can be traced to the task it worked on — declared, inferred, or both. False only where the journal hook never reaches a tool call for this host at all (OpenCode's plugin observes session lifecycle events alone, never one), since a declaration needs a tool call's own arguments to read. |

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
"read": { "undated_records": 3, "unreadable_lines": 2 }
```

`undated_records` are records carrying no moment at all. They belong to **no** period —
the only other moment available is the day the line was stored, which is when AIDD heard
about the work rather than when it happened. `unreadable_lines` are lines no parser could
read.

**Both non-zero means your total is partial.** Say so rather than presenting it as whole.

## Filling it

Records reach storage when someone runs:

```bash
aidd telemetry read              # every session the run journal knows
aidd telemetry read --session <id>
```

A period that reports nothing usually means its sessions have not been read yet.

## Known limits

[`docs/telemetry-limits.md`](../../docs/telemetry-limits.md) states what each tool can and
cannot be measured for, and why. Read it before explaining a missing figure.
