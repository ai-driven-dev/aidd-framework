# 03 - Choose the axis, and hand back the artefact it deserves

Read the question, pick the axis it names (SKILL.md's table), ask the script for that
answer, and render only what that axis calls for - never one shape for every question.

## Input

The path to `aidd telemetry`, and the question the user asked, in their own words.

## Output

**One axis, asked for by name.** Run
`aidd telemetry report --axis <total|day|step|model|agent|prompt|task|backlog|flow|tool|project|person> --from <day> --to <day>`,
never alongside `--json` - the axis flag already picks the one rendering that answers the
question, printed exactly as the script wrote it:

```
period <from_day> to <to_day>[, task <task>] — axis: <axis>

<the line, or the table>
```

Show it inline in the chat when the question named no destination. Write it to a file,
byte for byte what the script printed, when the question asked for a report, said to
paste, send, or keep it, or named a path outright - ask where, if it did not say. The
artefact's own first line already states its period and its axis, so it can still be
placed once the session that made it is gone.

**Everything at once, read inline.** When the question is broad enough that no single row
of SKILL.md's table fits - "what did this cost" with nothing narrower, or "where did the
spend go" with no named axis - answer in this shape, filled from the object and nothing
else.

```markdown
**<what was asked>** — <from_day> to <to_day>

| | |
| --- | --- |
| Sessions | <sessions> |
| Requests | <requests> |
| Tokens | <total, thousands separated> (<cache share>% cache) |
| Cost | <amount, or "unknown — no tool read locally reports one"> |

<when the question named a task, from `task_attribution`:>

**How the ticket was known**

| | Share |
| --- | --- |
| Declared by the flow | <n>% |
| Inferred from a written file | <n>% |

**Where it went**

| Step | Share | Tokens | Attribution |
| --- | --- | --- | --- |
| <step or "unattributed"> | <n>% | <tokens> | <stated by the tool \| from a journal interval \| —> |

**By model**

| Model | Share | Tokens |
| --- | --- | --- |

**By task**

| Task | Share | Tokens | Attribution |
| --- | --- | --- | --- |
| <task, or the reason it fell in none: "no usable run journal for this session" \| "older than anything this session's journal witnessed" \| "no usable task declaration in this session" \| "before the next task this session declares" \| "the journal falls silent before this record"> | <n>% | <tokens> | <declared by the flow \| inferred from a written file \| —> |

**By backlog item**

| Backlog item | Share | Tokens |
| --- | --- | --- |
| <backlog item, or "this task declares no backlog item" \| "this task's backlog declaration could not be read" \| the same reason "By task" gives a record in no task at all> | <n>% | <tokens> |

**By flow**

| Flow | Share | Tokens |
| --- | --- | --- |
| <the orchestrating skill and when it opened, or "outside any flow"> | <n>% | <tokens> |

<one line per limit that applies, or nothing>
```

A breakdown the object leaves empty is a section left out, never a table of zeroes.

## Process

1. **Choose the axis from the question**, using SKILL.md's table. A question that already
   names one - "by day", "by project", "per model", "per person" - needs no more reading
   than that.
2. **Ask, as one axis or as the whole object.**
   - One axis: `aidd telemetry report --axis <axis> --from 2026-08-01 --to 2026-08-31`.
   - Everything: `aidd telemetry report --from 2026-08-01 --to 2026-08-31 --json`, reading the shape from [cost-report-contract.md](../../../../../aidd_docs/product/cost-report-contract.md).
   - The figure will be kept or compared: give `--from` and `--to`, since `--days` resolves against today and two identical calls on two days cover two different periods.
3. **Refuse an unknown shape.** `cost_report_version` is `15` today, read from the `--json`
   path - the `--axis` path prints text the script already built from that same object, so
   there is no separate version to check there. The bump from `14` to `15` did not add a
   breakdown: `by_person`'s `resolution` gained a fourth value, `this-machine`, for a record
   that named nobody on a machine that has declared an identity. Report such a row as that
   person - declaring an identity names past work too, not only what follows. The bump
   from `13` to `14` did not add a
   breakdown: the reasons a `by_task` or `by_backlog` row can carry gained a fifth,
   `precedes-journal`, for a record older than everything its own session's journal
   witnessed. Report it as what it is - work billed before that session opened a journal,
   which a resumed transcript carries - never as the flow declaring its task late. The bump
   from `12` to `13` added `by_prompt`
   to the top-level breakdowns: the prompt that caused the work, the one breakdown no host
   limit can leave empty, since every record the reader stores already carries the turn it
   came from. The bump from `11` to `12` did not add a
   breakdown either: `by_task`'s `attribution` stopped being always `declared`, so one task
   can now hold two rows - one for what a declaration covered, one for what only a written
   file names. The bump from `10` to `11` did not add a
   breakdown: the reasons a `by_task` or `by_backlog` row can carry for a record in no task
   gained a fourth, `"no-journal"`, which says no usable run journal reached that record's
   session - a fact about the read, never the claim that the session declared no task. The
   bump from `9` to `10` added `by_agent` to the top-level breakdowns: which agent ran,
   which on Claude Code is where most of the spend is. Read its `attribution` before
   reading a row that names no agent: `main-thread` is a tool that names agents saying this
   record belongs to none of them, `not-stated` is a tool whose route never names one -
   every Codex, Copilot and OpenCode record - and calling the second a main thread would
   state a fact nothing observed. The bump from `8` to `9` added a
   fourth value to `attribution`, `prompt-matched`. The bump from `7` to `8` added `by_flow`
   to the top-level breakdowns: which orchestrated run the journal's own step sequence
   already names (see [cost-report-contract.md](../../../../../aidd_docs/product/cost-report-contract.md)),
   nothing newly captured for it. The bump from `6` to `7` added `by_backlog`
   to the top-level breakdowns: every task's records regrouped by what its own folder
   declares (see [cost-report-contract.md](../../../../../aidd_docs/product/cost-report-contract.md)),
   never a second notion of which task a record belongs to. The bump from `5` to `6` did
   not add a breakdown: what `by_task` gives for a record that fell in no declared
   interval can now be more than one row, each carrying `reason` - naming which distinct
   fact applies, so two different gaps are never read as one. The bump from `4` added `by_task` to the top-level breakdowns, grouped by the same
   declared intervals `--task` already filters on - never by a written file, which could
   place one session under two task rows at once. The bump from `3` to `4` added
   `by_person` to the top-level breakdowns and `identity_unusable` to `read`.
   - Anything else on the `--json` path: stop, rather than guessing which field means what.
4. **Fill the "everything" shape above from the object**, when that is the path taken. The
   headline comes from `totals`, the steps from `by_step`, the models from `by_model`, the
   tasks from `by_task`, the backlog items from `by_backlog`, and none of it needs
   re-adding since every breakdown already sums to its total.
   - A share is of cost when `totals.cost_micro_usd` is present, of tokens otherwise. Say which above the table.
   - Include "How the ticket was known" only when `task` is present - `task_attribution`
     otherwise does not exist on the object at all, never an empty array to render as zeroes.
   - `by_task` is always present, unlike `task_attribution`: it groups the whole period by
     whichever declared interval each record falls in, never by `--task`'s own
     whole-session written-file route. Never confuse the two - "How the ticket was known"
     answers a `--task` filter's own question, "By task" answers "which tickets did this
     period touch".
   - `by_backlog` answers a different question again: not which task, but which backlog
     item - "issue #661 cost X", never "this task cost X". Two tasks declaring the same
     item are already merged into one row; nothing here re-merges anything.
   - `by_flow` answers "what did this orchestrated run cost" - unrelated to task or
     backlog, and read with nothing new captured for it. Two runs of the *same*
     orchestrating skill in one session are two rows, told apart by when each opened -
     never merge them by name. Read `attribution` before comparing two rows:
     `journal-interval` is a run the journal opened and closed, `tool-stated` is every run
     of that skill only the record's own tool named, in a session whose journal opened no
     flow at all - it names no opening moment, because a name is not a run. A skill a
     person ran by hand while a flow was open is counted inside it, since the journal
     cannot tell it from one the orchestrator itself invoked - say so if it changes how a
     figure reads.
5. **Read `capability` before explaining an absent figure.** A tool that cannot supply a number and a session that consumed nothing look identical in the numbers.

   | False field | Means |
   | --- | --- |
   | `local_read.amount` | that tool's files carry no currency figure, true of every tool read locally today |
   | `local_read.tool_stated_step` | the tool never names the running skill, so its steps come from the journal or from nothing |
   | `journal_attributable` | the journal never names that tool's sessions, so a sweep never reaches them |
   | `task_attributable` | a session on this tool cannot be traced to a task, so it is absent from a task report without having done nothing |

6. **Keep `unattributed` as itself.** Nothing measured supports reading it as no step having run, and it is never a residual.
7. **Say when the answer is partial.** A non-zero `read.undated_records` or `read.unreadable_lines` means the total is incomplete, and the reasons are in [the plugin README](../../../README.md). The `--axis` path already carries this in its own last lines; the `--json` path carries it in `read`.
8. **Say when this project's own switch is off.** `measurement_enabled: false` on the `--json` path (a "switch is off" line in the `--axis` header) means these figures are not scoped to this project — the sink they come from is scoped to this person, across every project they ever measured. Relay both facts together: the switch is off here, and the figures shown are real, from wherever they were measured. Never read `false` as "these numbers are made up" or drop them for it.

## Test

| Case | Pass |
| --- | --- |
| A question names an axis | the artefact for that axis is printed, and nothing else |
| A question asks for a report, or to keep or send the figure | the artefact is written to a file, unchanged, stating its period and axis |
| A question is broad, naming no axis | the answer gives tokens, models, steps and tasks, and names the days it covered |
| A question asks per person | the `person` axis is used, one row per resolved person plus every unresolved identity |
| A question asks per framework task | the `task` axis is used, one row per task declared in the period plus the row for what declared none |
| A question asks per backlog item, or what a ticket cost | the `backlog` axis is used, one row per declared item, tasks that named none merged into their own row |
| A question asks per orchestrated run, or what a pipeline cost | the `flow` axis is used, one row per run the journal's sequence names, plus the row for work outside any flow |
| The same orchestrating skill ran twice in one session | two rows, told apart by when each opened, never merged into one |
| A tool carries no amount | the answer says unknown and never prints a currency zero |
| A tool is not covered | the answer gives its declared reason instead of a figure |
| The read was partial | the answer says so before giving the total |
| Two answers for the same period | they carry the same numbers in the same order |
| `measurement_enabled` is `false` | the answer says the project's switch is off, alongside the real figures, never in place of them |
