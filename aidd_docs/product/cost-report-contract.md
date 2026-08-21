# Cost report contract

**Read this if you are writing a skill, or anything else that reports on AIDD work.**
It describes what `aidd telemetry report --json` prints: one object, the same shape
whatever tool did the work, carrying both the figures and a statement of what each tool
could and could not supply.

> If instead you are building a **pricing service or an aggregator** that consumes stored
> records directly, read [`metrics-contract.md`](./metrics-contract.md) — the contract for
> one stored line. The two are deliberately different audiences, and picking the wrong one
> is expensive: the record contract makes you responsible for the two double-count rules,
> the split between the two record kinds, and re-read deduplication. This one has already
> applied all three.

**Never reconstruct these figures from stored records.** One computation in one place is
the whole point: two ways of computing a number is how they start disagreeing.

## Getting the object

```bash
aidd telemetry report --json
aidd telemetry report --from 2026-08-01 --to 2026-08-31 --json
aidd telemetry report --task 2026_08/2026_08_21_cost-reporter --json
```

Prints one JSON object on stdout and exits `0`, including when the period holds nothing.
A period that is not a period — `--from notaday`, `--days 0` — exits `1` naming the flag.

## Determinism

**The same files and the same absolute period produce byte-identical output.** That holds
across repeated calls and across the order records happen to sit in on disk, which differs
between machines because a re-read appends.

It does **not** hold for `--days`, which resolves against today. `--days` is the human
shorthand; anything that stores or compares a figure should ask for `--from` and `--to`.
The object always reports the period **as it resolved**, absolutely, never as it was asked
for — so a figure taken from a `--days` call can still be cited by the days it covered.

## Versioning

Every object carries `cost_report_version`, currently `1`.

**Set aside an object whose version you do not recognise rather than guessing its shape.**
The number is bumped when a consumer that understood the previous shape would misread this
one. Adding a field you may ignore is not a bump; changing what an existing field means is.

## The shape

```jsonc
{
  "cost_report_version": 1,
  "period": { "from_day": "2026-07-01", "to_day": "2026-07-31" },
  "task": "2026_08/2026_08_21_cost-reporter",   // absent unless --task was given
  "sessions": 1,
  "totals": { "requests": 2, "input_tokens": 13930, "output_tokens": 4377, "cache_read_tokens": 165632, "cache_creation_tokens": 0 },
  "active_time_s": 2820,                        // absent when no record carried it
  "by_step":   [{ "step": "aidd-dev:02-implement", "attribution": "journal-interval", "totals": {} }],
  "by_model":  [{ "model": "gpt-5.6-sol", "totals": {} }],
  "by_tool":   [{ "tool": "codex", "coverage": "covered", "reason": "…", "capability": {}, "totals": {} }],
  "attribution": [{ "attribution": "tool-stated", "totals": {} }],
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

`by_step`, `by_model` and `by_tool` are ordered largest first, with a stable tie-break, so
the biggest thing is the first thing you read.

**Every breakdown sums exactly back to `totals`.** That is asserted, on integers, not
hoped for.

`by_step` is keyed by the step **and** the strength of its attribution: one skill reached
once from the tool's own statement and once from a journal interval is two rows, because
they are two different claims. A row with no `step` carries `attribution: "unattributed"`.

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
| `task_attributable` | This tool's writes can be traced to the task they landed in. |

`coverage` is `"covered"` or `"not-covered"`, and `reason` says why when it is the second,
or what a covered tool's figures cannot be used for.

**Four silences, and only one is a zero.** A tool with `requests: 0` may be: not covered at
all (`coverage: "not-covered"`, read `reason`), covered but unreachable by the sweep
(`journal_attributable: false`), covered and reached and idle (a real zero), or covered and
its reader failed (the human output says so; `aidd telemetry read` reports it per tool).

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
