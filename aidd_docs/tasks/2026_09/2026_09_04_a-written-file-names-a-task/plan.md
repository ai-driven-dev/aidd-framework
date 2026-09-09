---
status: done
---

# A written file names a task, and says that is how it knows

## Frame

### What is missing

`by_task` reads one of the two signals a run journal holds.

| Journal line | Read by `by_task` |
| --- | --- |
| `task_declared` | yes |
| `file_written` | no |

Measured on the one session in the sink with a complete journal: 1045 of 1073 records fall
inside a declared interval, 97.4%. The remaining 27 all sit between `session_start`
(05:21:27) and the first declaration (05:59:09) — 38 minutes of work before the flow named
its ticket. That session wrote into exactly one task folder for its whole life.

So those 27 records have an answer nobody is reading. The type that would carry it already
exists: `TaskAttributionSource = "declared" | "inferred"`, and `CostReportTaskRow` already
carries an `attribution` field — today always `"declared"`, which makes it a field that
distinguishes nothing.

### Why this was refused before, and what changed

`by_task` refuses written paths deliberately, and a test locks the refusal: the `--task`
filter's own inferred route attributes a **whole session**, which can place one session
under two task rows at once. That objection is sound and is not being overruled. Two bounds
answer it, and both are required:

1. **One folder or none.** A session that wrote into two task folders infers nothing — two
   candidates, no reason to choose. It keeps the reason row it has today.
2. **Inside the journal's own witnessed span.** Without this bound, this very session would
   attribute seven days of records to a task folder created today: its journal was lost and
   recreated at 09:54 while the sink holds its records back to 2026-08-28. Measured, not
   imagined. A record outside the span the journal actually witnessed stays unattributed.

### Decisions

**A task with both routes is two rows, not one.** The same task can hold declared records
and inferred ones — 1045 and 27 in the measured session. One row carrying the weaker
attribution would state something false about the 1045. Two rows follow the convention
`by_step` already uses, whose rows are `(step × attribution)` pairs; the accumulator mirrors
`addToStepGroup` line for line rather than inventing a second way to key a pair.

**Nothing is asked of a skill or of the model.** `file_written` is written by the hook at
turn end, from a walk of the task tree. This route consumes what is already captured.

**The envelope rises to 12.** `by_task`'s `attribution` stops being always `"declared"`; a
consumer that read it as constant misreads this version.

## Phases

| # | Phase | Proves |
| --- | --- | --- |
| 1 | A session's witnessed span reaches the report | a record outside it can be refused |
| 2 | One written folder names the records no declaration covers | 97.4% becomes 100%, marked `inferred` |
| 3 | The contract says both | envelope version, contract document, display |

Test first at every phase; each guard ships with the mutation that proves it.

## Result

Measured on the one session in a real sink with a complete journal, 1073 requests:

```
declared 1045 + inferred 28 = 1073   (100.0%)   reste 0
```

97.4% before, 100.0% after. Nothing was asked of a skill or of the model: `file_written` was
already written by the hook at turn end.

Two bounds carried the change, and both fired on real data:

- **One folder or none.** Unit-guarded, and proven end to end on a session that writes into
  two task folders and therefore keeps `precedes-declaration`.
- **Inside the journal's witnessed span.** On the same sink, one session's journal was lost
  and recreated: 28,079 records from the seven days before it stay unattributed, exactly as
  they should. Without the bound they would have been named after a folder that session
  touched today.

A third fact turned up while measuring and is fixed here rather than left: a journal moment
is a **second** (`nowIso()` strips the milliseconds) while a record carries them, so a record
landing inside the very second the journal last wrote was being refused by a rounding
artefact. It cost exactly one record of 1073 — the difference between 99.9% and 100.0%.

Nine mutations, each killed by the test that names it. `pnpm test` — build included — 311
files, 3450 tests. Contract at `cost_report_version` 12, its worked example pinned to the
emitted version, and every reason now required as a table row rather than a mention
anywhere in the prose.
