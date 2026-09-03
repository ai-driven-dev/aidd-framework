# The read path, met at a hundred sessions

What [#694](https://github.com/ai-driven-dev/framework/issues/694) asks to be written down
rather than assumed acceptable: how long a period answers once the sink holds a year of day
files and a hundred journalled sessions. Everything below was run on 2026-09-03.

## Method

`build-scale-sink.mjs`, beside this file, writes a sandbox sink and prints what it wrote.
It is deterministic — a fixed seed, so two runs measure the same bytes — and every
identifier is generated. It never reads or writes a real store.

```bash
node build-scale-sink.mjs /tmp/sink 100 365 30
AIDD_TELEMETRY_DIR=/tmp/sink aidd telemetry report --from 2025-09-04 --to 2026-09-03
```

Sessions are spread across the year rather than piled on one day, and **every day of the
year carries a file, empty days included**: a reader that skips absent files is not the same
code path as one that opens 365 of them.

Seven runs per figure, median reported with the spread. `HOME` is a sandbox and the project
has measurement off, so nothing on this machine is touched.

## What it costs

Two scales, ten times apart.

| Sink | Day files | Sessions | Records | Size | `report`, full year | Above the binary's own start |
| --- | --- | --- | --- | --- | --- | --- |
| 1× | 365 | 100 | 3,000 | 1.49 MB | 238 ms | **49 ms** |
| 10× | 365 | 1,000 | 30,000 | 14.87 MB | 316 ms | **127 ms** |

`aidd --version` costs 189 ms on this machine and does nothing. That is the floor every
figure above sits on, and subtracting it is the only way to see the read at all.

**Ten times the records cost 2.6 times the read, not ten.** Opening 365 files is paid once
whatever they hold, so the per-record cost is the smaller half at this scale. Nothing here
grows with the *period* asked for either — the same year and the default seven days land
within 3 ms of each other, because both open the same directory listing.

| Command, 1× sink | Median | Min | Max |
| --- | --- | --- | --- |
| `report`, the full year | 232 ms | 227 ms | 247 ms |
| `report --json`, the full year | 245 ms | 233 ms | 264 ms |
| `report`, default 7 days | 229 ms | 225 ms | 235 ms |
| `report --axis step` | 236 ms | 231 ms | 243 ms |
| `telemetry check` | 206 ms | 204 ms | 209 ms |
| `--version` (does nothing) | 189 ms | 187 ms | 193 ms |

## What it answers

Both sinks reconcile to the unit against what the generator wrote:

| Sink | Generated | Reported |
| --- | --- | --- |
| 1× | 114,007,613 | 114,007,613 |
| 10× | 1,137,292,186 | 1,137,292,186 |

Sessions and requests come back exactly too: 100 / 3,000 and 1,000 / 30,000.

And **every axis the report can print sums to that total**, in tokens and in requests both —
checked against `--json` rather than read off the text, so no rounding hides a gap:

| Axis | Rows | Tokens | Requests |
| --- | --- | --- | --- |
| `by_step` | 6 | = total | = total |
| `by_model` | 4 | = total | = total |
| `by_tool` | 5 | = total | = total |
| `by_project` | 4 | = total | = total |
| `by_task` | 1 | = total | = total |
| `by_backlog` | 1 | = total | = total |
| `by_flow` | 1 | = total | = total |
| `by_day` | 365 | = total | = total |
| `by_person` | 1 | = total | = total |
| `attribution` | 3 | = total | = total |

Ten independent groupings, one number. A hundred sessions is not where this arithmetic stops
holding. Note `by_day` carries a row per day of the year, empty days included — its 365 rows
summing exactly is the same claim as "nothing was dropped or double-counted across files".

## What it refused, which is the more useful half

The first build wrote `sink_schema_version: 1`. The current schema is 2, and the report
said so:

```
  sessions                  nothing in this period
  by day
    365 days in this period
  3,000 lines could not be read
```

Three thousand unreadable lines were reported as three thousand unreadable lines, not as a
zero and not as an empty period. That is the failure mode #694 exists to make impossible,
and it was demonstrated by accident before it was demonstrated on purpose.

## What this does not prove

- **Synthetic records.** Real lines carry the same fields, but a real store's size per record
  could differ; the shape of the curve would not.
- **One machine.** macOS 26.5, node v24.20.0, an SSD. A cold cache or a network-mounted
  `AIDD_TELEMETRY_DIR` is another measurement, and a slower one.
- **The write path.** This is the read alone. The turn-end walk has its own budget, measured
  2026-08-22 and recorded in `2026_08/2026_08_21_telemetry-v1-close/measurements.md`.
- **A real session.** No AI tool ran here. That is the remaining box on #694 and on #707.
