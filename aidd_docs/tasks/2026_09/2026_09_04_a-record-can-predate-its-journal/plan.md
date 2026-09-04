---
status: done
---

# A record can predate its journal

## The claim being made today

96.2% of a real period reads `"precedes-declaration"`, whose own doc comment says what that
asserts: "a record before the session's very first declaration". Read plainly, the report
tells a person their flow declares its task late, almost always.

That is false for nearly all of them.

## Measured, on this project's own sink and its two run journals

The period holds 29,207 reported requests across two sessions. Splitting the
`"precedes-declaration"` population by where each record's moment falls against its own
journal:

| Where the record's moment falls | Records | Share |
| --- | --- | --- |
| before the journal witnessed anything at all | 28,570 | 96.2% |
| at or after that session's first declaration | 1,045 | 3.5% |
| after `session_start`, before the first declaration | 50 | 0.2% |
| no journal for this session | 34 | 0.1% |

Two journals. One opened at `2026-09-04T05:21:27Z` and first declared at `05:59:09Z`; the
other opened at `09:54:43Z` and first declared at `10:23:36Z`.

So of everything currently labelled "before this session declared a task", **fewer than one
in five hundred** was actually a late declaration. The rest are billed turns the session
inherited: a resumed transcript carries its earlier turns, and reading it stores them under
the session that read them, dated when they were billed — days before that session's journal
was ever written.

## The fault, one level down from the fault `"no-journal"` fixed

`"no-journal"` was added because folding a fact about the read into `"no-declaration"` made
the report assert that a session declared nothing when the truth was that its journal was
never found. The same shape is here: folding "no journal covered this moment" into
`"precedes-declaration"` makes the report assert late declaring when the truth is that no
journal existed yet.

## The change

A fifth `TaskUnattributedReason`, `"precedes-journal"`: this record's moment is older than
the earliest moment its session's journal witnessed.

Keyed on `CostReportSessionJournal.witnessed.fromMs`, which already exists and already means
exactly that — not on the `session_start` line, which would be a second notion of when a
session began. Verified on both journals that `min(at)` over every line equals `session_start`,
so the key is the same split with one less field threaded through.

Checked before `"no-declaration"`: a journal that declared nothing *and* did not cover the
record is described by the coverage fact, which is the one that explains why no declaration
could have covered it.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| a record older than everything its journal witnessed reads `"precedes-journal"` | drop the coverage check |
| a record inside the span, before the first declaration, still reads `"precedes-declaration"` | widen the check to every unattributed record |
| a journal that declared nothing and did not cover the record reads `"precedes-journal"`, not `"no-declaration"` | order the coverage check after the empty-intervals check |
| a journal carrying no readable moment never claims coverage | default an absent span to `Infinity` |
| the report itself passes the journal's span, not only the function | drop the third argument at the call site |
| every consumer names the fifth reason | remove one key from `TASK_UNATTRIBUTED_LABELS` |

A sixth guard, unrelated to the reason but found while making this change: nothing checked
the `cost_report_version` the skill names against the one the CLI emits. The contract
document has had that guard since version 10; the skill, which refuses an object whose
version it does not know, had none — so a bump could ship leaving the skill set to refuse
the object it was built to read. Killed by leaving `03-report.md` naming `12`.

Rejected as an equivalent mutant: defaulting an absent span to `0`. Every moment this
function is ever asked about is after 1970, so `momentMs < 0` is false and the mutant
behaves identically. `Infinity` is the mutation that actually flips the branch.

## Envelope

`cost_report_version` `13` -> `14`: an existing field gains a value a consumer switching
exhaustively on the four previous reasons does not know. Same precedent as the `"no-journal"`
bump.

Rebased onto `by_prompt`'s own bump to `13` once that merged. Found in the rebase: that
change bumped the number and never wrote its entry in the contract's version history, which
jumped from `currently 13` straight to "Bumped from `11`". Both entries are written here.
## Proven end to end

Built binary, the real sink copied read-only into a sandbox `HOME` and
`AIDD_USER_CONFIG_DIR`, same command on both builds, period 2026-08-01 to 2026-09-30:

| Row | `origin/next` | this branch |
| --- | --- | --- |
| older than anything this session's journal witnessed | — | 28,079 |
| before the next task this session declares | 28,101 | 22 |
| no usable run journal for this session | 33 | 33 |
| named tasks (5 rows) | 1,073 | 1,073 |

`by_task` and `by_backlog` both sum to 29,207, the period total, on both builds.

So what the report now says the flow declared late is **22 requests, 0.08% of the period** —
where it said 28,101, 96.2%. The other 28,079 are named for what they are.

The 28 records the earlier measurement counted between `session_start` and the first
declaration do not appear in either reason row: the `"inferred"` route names them first,
from the one task folder that session wrote into. 28 + 22 is the 50 that measurement found.
