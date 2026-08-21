# 03 - Report the figures, and only those

Ask the script for its object, and answer the user's question from that alone.

## Input

The path to `telemetry-report.js`, and the period or task the user asked about.

## Output

An answer in this shape, filled from the object and nothing else.

```markdown
**<what was asked>** — <from_day> to <to_day>

| | |
| --- | --- |
| Sessions | <sessions> |
| Requests | <requests> |
| Tokens | <total, thousands separated> (<cache share>% cache) |
| Cost | <amount, or "unknown — no tool read locally reports one"> |

**Where it went**

| Step | Share | Tokens | Attribution |
| --- | --- | --- | --- |
| <step or "unattributed"> | <n>% | <tokens> | <stated by the tool \| from a journal interval \| —> |

**By model**

| Model | Share | Tokens |
| --- | --- | --- |

<one line per limit that applies, or nothing>
```

A breakdown the object leaves empty is a section left out, never a table of zeroes.

## Process

1. **Ask, always as an object.** Run one of `node <telemetry-report.js> report --json`, `... report --from 2026-08-01 --to 2026-08-31 --json`, or `... report --task 2026_08/2026_08_21_cost-reporter --json`, reading the shape from [cost-report-contract.md](../../../../../aidd_docs/product/cost-report-contract.md).
   - The figure will be kept or compared: give `--from` and `--to`, since `--days` resolves against today and two identical calls on two days cover two different periods.
2. **Refuse an unknown shape.** `cost_report_version` is `1` today.
   - Anything else: stop, rather than guessing which field means what.
3. **Fill the shape above from the object.** The headline comes from `totals`, the steps from `by_step`, the models from `by_model`, and none of it needs re-adding since every breakdown already sums to its total.
   - A share is of cost when `totals.cost_micro_usd` is present, of tokens otherwise. Say which above the table.
4. **Read `capability` before explaining an absent figure.** A tool that cannot supply a number and a session that consumed nothing look identical in the numbers.

   | False field | Means |
   | --- | --- |
   | `local_read.amount` | that tool's files carry no currency figure, true of every tool read locally today |
   | `local_read.tool_stated_step` | the tool never names the running skill, so its steps come from the journal or from nothing |
   | `journal_attributable` | the journal never names that tool's sessions, so a sweep never reaches them |
   | `task_attributable` | its writes cannot be traced to a task, so it is absent from a task report without having done nothing |

5. **Keep `unattributed` as itself.** Nothing measured supports reading it as no step having run, and it is never a residual.
6. **Say when the answer is partial.** A non-zero `read.undated_records` or `read.unreadable_lines` means the total is incomplete, and the reasons are in [telemetry-limits.md](../../../../../docs/telemetry-limits.md).

## Test

| Case | Pass |
| --- | --- |
| A period is asked for | the answer gives tokens, models and steps, and names the days it covered |
| A tool carries no amount | the answer says unknown and never prints a currency zero |
| A tool is not covered | the answer gives its declared reason instead of a figure |
| The read was partial | the answer says so before giving the total |
| Two answers for the same period | they carry the same numbers in the same order |
