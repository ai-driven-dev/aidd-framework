# What AIDD measurement cannot tell you

Every limit below was established by probing the tool, not by reading its documentation.
They are written down here because each one keeps being rediscovered, and because a reader
who does not know them reads silence as a zero — a session that looks free, a task that
looks like it produced nothing. Both are the failure this layer exists to prevent.

A figure AIDD cannot produce is named as missing, never printed as `0`.

## Two routes, and neither covers every tool

A tool's consumption reaches AIDD one of two ways.

- **Reading its own files.** The tool already writes a transcript; `aidd telemetry read`
  opens it. Nothing needs to be running, and nothing leaves the machine.
- **Its OTLP export.** The tool sends what it measures to a receiver AIDD runs. This needs
  the tool's export turned on, and a process listening.

Coverage differs per route, per tool. `aidd telemetry report` prints a row for every tool,
including the ones nothing can read, with the reason.

## Cursor cannot be measured at all

Cursor writes **no token count in any file it produces**, so there is nothing on disk for a
local read to find. Its own telemetry export exists, but enabling it is a team setting on
an Enterprise plan, in beta, that nobody outside a Cursor admin can turn on — so the
attribute its payload would carry has never been captured, and naming one from
documentation would be a guess.

Uncovered by both routes. This is a fact about Cursor, and there is nothing to implement
here that would change it.

## Copilot gives no per-step breakdown

Copilot's own session file carries `outputTokens` per turn and nothing else. Input, cache
and reasoning figures arrive **once, at shutdown, for the whole session** — so no
per-request record can be built from it, and no figure can be placed inside one step rather
than another.

Its file's own `cost` field is denominated in **premium requests, not currency**. Measured
across fourteen local sessions: the figure sits at `0.33` for every single-request
`claude-haiku-4.5` session while consumption ranges from 2.04 to 2.95 billion nano-AIU and
output from 46 to 154 tokens. It tracks request count times a per-model multiplier and is
invariant to what was consumed, so it is never read as an amount.

Only Copilot's OTLP export would close the per-step gap, and only if the user turns it on
themselves.

## Only Claude Code sessions can be attributed to a task

A task is derived from the files a session wrote: the run journal records a repository
relative path each time a session writes inside a task folder, and the reader turns that
path into the task's identity.

The journal reads that path from the tool's own hook payload, and **only Claude Code's
carries one in a readable form**. Copilot's and Cursor's were never captured doing so, and
Codex writes through an `apply_patch` command string that would have to be parsed rather
than read.

**However the tool wrote it.** A payload naming a path is exact and is recorded as
`source: "tool-stated"`. A write made through a shell command, an `apply_patch`, or
anything else that names no path is caught differently: at the end of every turn the hook
walks the task tree and records what changed, as `source: "observed"`.

That second pass is an observation, not a statement, and it can in principle attribute a
file something else on the machine wrote into a task folder during the same turn. A
consumer that must not risk it filters on `source`.

A session on any other tool is still fully reportable **by period**, and **by step** where
a run journal covers it. It simply belongs to no task. A Codex session with no task is not
a session that touched nothing.

## No amount is computed here

The rates that turn tokens into money live in a separate service. This repository reports
an amount only where a tool's own files already carried one, which today means Claude Code
alone. Everywhere else the report says the amount is unknown and shows the tokens.

An unknown amount is not a zero, and the report never prints one as the other.

## An attribution says how strong it is

Where a report attributes consumption to a step, it also says how it knew:

| Reads | Means |
| --- | --- |
| stated by the tool | The tool named the running skill itself, on the same line as the counters. Exact. |
| from a journal interval | The step was derived from the interval between two boundaries the framework recorded. An inference. |
| unattributed | Neither source could say. |

**Unattributed does not mean no step ran.** On at least one measured tool the two are
indistinguishable — the field is omitted both when no skill ran and when the tool's version
predates the field entirely — so asserting the stronger reading would invent a fact. The
report says unattributed, and a consumer must not collapse it into anything else.

## A tool can be readable and still unreachable

A report reads what has been stored, and storing happens when someone runs
`aidd telemetry read`. With no session named, that reads **every session the run journal
knows** — which is how a person gets a report without ever learning a session identifier.

The journal names sessions for the four hosts its hook runs under. **OpenCode is not one
of them**: no hook or plugin payload has ever been captured carrying its own session
identity, so nothing joins. Its files can be read perfectly well, and its sessions are
reachable only by naming one:

```bash
aidd telemetry read --session ses_...
```

A machine-readable report carries this as `journal_attributable` per tool, precisely so a
consumer can tell "readable but not swept" from "did no work". Closing it belongs with
whether a plugin can write the journal at all.

## A period means when the work ran

A session read after the fact is stored on the day it was read, while its records carry the
moments they actually happened. Reports select on the record's own moment, so work done in
July stays in July however late it was read.

Ask for a period absolutely — `--from 2026-08-01 --to 2026-08-31` — when the figure will
be stored or compared. `--days` is the human shorthand and resolves against today, so two
identical calls on two days cover two different periods. Either way the report states the
period **as it resolved**, so a figure can always be cited by the days it covered.

A record carrying no moment at all belongs to **no** period. The report counts those
separately and says so, rather than placing them by the day they were stored — that day is
when AIDD heard about the work, not when the work happened.

## Where the details live

- [`aidd_docs/product/cost-report-contract.md`](../aidd_docs/product/cost-report-contract.md)
  — what `aidd telemetry report --json` prints, for a skill or anything else that reports
  on AIDD work.
- [`aidd_docs/product/metrics-contract.md`](../aidd_docs/product/metrics-contract.md) — the
  stored shape, field by field, for a pricing service or an aggregator reading raw records.
- [`aidd_docs/runs/README.md`](../aidd_docs/runs/README.md) — what the run journal records
  and what it deliberately does not.
- [`docs/FAQ.md`](./FAQ.md) — whether measurement is on at all, and how to turn it off.
