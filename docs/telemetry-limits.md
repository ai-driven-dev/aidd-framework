# What AIDD measurement cannot tell you

Every limit below was established by probing the tool, not by reading its documentation.
They are written down here because each one keeps being rediscovered, and because a reader
who does not know them reads silence as a zero — a session that looks free, a task that
looks like it produced nothing. Both are the failure this layer exists to prevent.

A figure AIDD cannot produce is named as missing, never printed as `0`.

## Where each thing is written, and why it lives there

Two files, two different owners.

**The run journal** lands in `aidd_docs/runs/`, inside the repository it describes. Every
line names a repository-relative path or a task folder, so it only reads correctly from
inside the checkout that produced it — moved outside, it would describe one repository
with no way to say which. It records who worked on what, for how long, and every file each
session wrote, and nothing else: no token, no cost, no model. Because it belongs to the
repository, keeping it out of a commit is the repository's business too — turning
measurement on, through `aidd setup`, `aidd plugin add`, or the plugin's own
`telemetry-switch.js on`, adds it to `.gitignore` there and then.

**The stored figures** land under `AIDD_USER_CONFIG_DIR`, or `~/.config/aidd/telemetry/`
when that variable is unset — with the person, not the checkout. A session's consumption
belongs to whoever ran it and the machine they ran it on: tied to a checkout instead, the
same person working from two clones of one project would look like two people. They hold
token counts, model names and, where a tool's own files carry one, a cost — read out of
files the tool already wrote, never a prompt, a diff, or code.

### Choosing another location for the figures

`AIDD_USER_CONFIG_DIR` is that choice, offered rather than merely available: point it at a
directory a team shares, or one a CI owns per repository, and every figure this layer
writes follows it. The default stays the default — right for the case that is nearly
everyone, one person on one machine. The cost of moving away from it: nothing outside
`~/.config/aidd/` is swept together with the rest of a person's figures by anything that
assumes the default, so a reader pointed at the default alone finds the moved figures
absent, not elsewhere.

## A host project that declares `"type": "module"`

Node decides a `.js` file's module system from the nearest `package.json` walking up, and a
project-scope install puts this plugin's files under the host project's own declaration. In a
project that declares `"type": "module"`, that used to kill every script this plugin ships at
its first `require`, before a line of its own ran.

The skills are closed: `skills/package.json` declares `"type": "commonjs"`, so
`telemetry-switch.js`, `telemetry-report.js` and `telemetry-check.js` run the same in either
kind of project. Two install-shape suites assert it, and they fail without that one file.

**The hooks are not, and that is a trade rather than an oversight.** `hooks/` holds one
genuine ESM module, `opencode-plugin.js` — OpenCode runs nothing else, and its loader was
measured refusing an `.mjs` rename. A `"type": "commonjs"` beside it would fix the hook path
and break OpenCode's, so the hook scripts still take the host project's declaration. Under an
ESM project, install the plugin at user scope (`~/.claude/plugins/`, `~/.codex/plugins/`),
where the host's `package.json` is not above them.

## Two routes, and neither covers every tool

A tool's consumption reaches AIDD one of two ways.

- **Reading its own files.** The tool already writes a transcript; `aidd telemetry read`
  opens it. Nothing needs to be running, and nothing leaves the machine.
- **Its OTLP export.** The tool sends what it measures to a receiver AIDD runs. This needs
  the tool's export turned on, and a process listening.

Coverage differs per route, per tool. `aidd telemetry report` prints a row for every tool,
including the ones nothing can read, with the reason.

The chain check answers two questions about the export route, and each has a limit worth
knowing before you read its verdict.

**`export configured` on Codex checks which exporter was chosen, not where it points.** A
`metrics_exporter` other than the default reads `ok`, even if the endpoint sends your metrics
somewhere you did not intend. No endpoint key under Codex's `[otel]` table has ever been
measured here, so nothing checks one.

**A Cursor or an OpenCode session reaches both export claims as `--`, by the general reason
rather than a per-tool one.** Only Codex and Claude Code publish a session anchor this check
can read, so under those two tools it cannot tell whose settings to look at. `--` means it had
nothing to evaluate, which is the honest answer — it is not a claim that the export is fine.

## Cursor journals, and still yields no figure

Cursor writes **no token count in any file it produces**, so there is nothing on disk for a
local read to find. Its own telemetry export exists, but enabling it is a team setting on
an Enterprise plan, in beta, that nobody outside a Cursor admin can turn on — so the
attribute its payload would carry has never been captured, and naming one from
documentation would be a guess.

Uncovered by both figure routes, and that is a fact about Cursor rather than something left
to implement.

What it *does* do is journal. Which steps ran, and when, is recorded — so a Cursor session
appears in a report by step, with no amount beside it. Getting there took finding that
Cursor never loads a plugin's own `hooks.json`: across three probes, headless and
interactive, auto-discovered and explicitly loaded with a valid manifest, **not one of
seven declared events fired**. The project's own `.cursor/hooks.json` fires normally, and
that is where an install now puts them.

Two details a reader will otherwise trip on. Cursor names its repository root
`workspace_roots`, where every other tool says `cwd`. And the event that closes a turn
differs by mode: interactively `stop` fires and `sessionEnd` does not, headlessly the
reverse. Both are subscribed, so each mode records exactly one turn boundary.

## Codex will not run a hook nobody approved, and says nothing

**Trust is per hook entry, not per plugin, and a renamed event is a new entry.** Codex keys
each approval as `<plugin>@<marketplace>:hooks/hooks.json:<event>:<matcher>:<hook>`. Approving
a plugin's `session_start` approves nothing for its `session_end`, and an event that changes
name inherits nothing from the name it had. The symptom is the one worth recognising: the
session journals a `session_start` and no `turn_end`, which looks exactly like a hook wired to
the wrong event. `aidd telemetry check` tells the two apart, and so does
`scripts/verify-chain.mjs`.


Codex keeps a trust hash per hook and skips any it has not been asked to trust. It prints
no warning when it does. Four consecutive sessions ran clean and journalled nothing before
the difference became visible, and from the outside that silence is identical to a session
where no work happened.

A person approves it once, interactively, and never thinks about it again. Anything
headless — CI, an agent, a scheduled run — never sees the prompt. `--dangerously-bypass-hook-trust`
makes a single invocation run the hook and **persists nothing**, so the next run needs it
again; whether trust can be granted without a terminal at all is not established.

Installing a plugin that ships hooks for Codex now says this, and `aidd telemetry check`
tells "not trusted" apart from "never fired" wherever the trust state is readable.

## Copilot gives one number for the session, and none per step

Copilot writes its counters **once, at shutdown, for the whole session** —
`session.shutdown` in `~/.copilot/session-state/<id>/events.jsonl` carries input, output,
cache read and cache write together. That total is read, and it is the only figure Copilot
offers: nothing in its files counts a single request, so no amount can be placed inside one
step rather than another however well the boundary is known.

It is stored as a **session** record and never as a request. The two are never added
together: one is a billed call, complete in itself; the other is a total that already
contains every call it covers. A report prints Copilot's row as `N tokens (session total,
not requests)`, and its request count stays `0` because that is the true answer rather than
a silence to explain.

Two traps found while reading that file, both avoided. Its `usage.inputTokens` is
*inclusive* of cache writes where `tokenDetails.input` is exclusive, so only the second is
read — the first would make Copilot's input look larger than every other tool's for the same
work. And `currentModel` names the session's **last** model, so no model is stamped on the
record: attributing a whole session to whichever model happened to answer last is the kind
of plausible wrong answer this layer exists to refuse.

Its file's own `cost` field is denominated in **premium requests, not currency**. Measured
across fourteen local sessions: the figure sits at `0.33` for every single-request
`claude-haiku-4.5` session while consumption ranges from 2.04 to 2.95 billion nano-AIU and
output from 46 to 154 tokens. It tracks request count times a per-model multiplier and is
invariant to what was consumed, so it is never read as an amount.

Only Copilot's OTLP export would give a per-request figure, and only if the user turns it
on themselves.

Its steps, though, are readable. A Copilot session names the skill it is running, on both
of the payload shapes Copilot itself sends — its own canonical one and the `_vsCodeCompat`
one, which spells the tool name Copilot's way and the arguments Claude Code's way. Neither
value followed from the other, and both were captured rather than inferred. So a Copilot
session attributes to the step that ran; it simply carries no amount to place inside it.

## Every tool journals, and four of five can name the ticket

A ticket is known two ways, and they are different claims.

**Declared.** A session that opens a plan under `aidd_docs/tasks/` names the ticket by doing
so — reading it, grepping it, or naming it in a shell command. The journal records that as
`task_declared`, the same way it already records which skill is running: told, not deduced.
Nothing about it depends on the shape of a tool's payload, which is why it works where
inference does not. A report says `declared` beside such a figure.

**Inferred.** A session that writes a file inside a task folder is attributed to that task
from the path. This needs the tool's own hook payload to name a path in readable form, and
**only Claude Code's does** — Copilot's and Cursor's were never captured doing so, and Codex
writes through an `apply_patch` command string that would have to be parsed rather than
read. It stays, and it covers work done outside any declared ticket. A report says
`inferred`.

Declaration wins where both are available, and neither is ever assumed: a session that
declared nothing belongs to no ticket rather than to the last one seen. A declaration is
bounded by the next declaration or the end of the turn, and capped at the journal's own last
recorded moment — an unclosed one cannot swallow the rest of a week, and cannot reach the
next session at all, because a run journal belongs to one session.

**OpenCode is the exception, for a new reason.** Its plugin receives only the events that
open and idle a session; no tool call ever reaches the journal, so there is nothing to
declare from. That is a different limit from the one above — not a payload that fails to
name a path, but no payload at all.

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

## A sweep reaches a session only where the journal was installed

A report reads what has been stored, and storing happens when someone runs
`aidd telemetry read`. With no session named, that reads **every session the run journal
knows** — which is how a person gets a report without ever learning a session identifier.

The journal names sessions for every host its hook runs under, and a hook runs under all five.
OpenCode was the last: its runtime ignores a declarative `hooks.json` entirely and runs only a
genuine ESM module, which is why nothing had ever seen its session id. A module it does load
sees one, and a sweep reaches sessions nobody named by hand.

Running under a host and being delivered to it are different claims, and they have come apart
before. What each install route delivers is stated per tool in
[`ARCHITECTURE.md`](ARCHITECTURE.md#-bundled-hooks); a tool whose journal was never installed is
swept and found empty, which is the honest answer rather than a zero.

A machine-readable report still carries `journal_attributable` per tool, precisely so a
consumer can tell "readable but not swept" from "did no work". It is a declaration about
the tool, and a tool whose journal is not installed will be swept and found empty — which
is the honest answer, not a zero.

**OpenCode misses the first session of a server process.** Its plugin is loaded lazily, by the
very request that creates that session, so the event announcing it is published before a handler
exists to receive it. Nothing fails and nothing says so. Every session after it journals normally.
This is not a race a retry closes — the handler does not exist yet — and the plugin is handed no
session identifier it could use to recover the one it missed.

Which matters more than it first reads: a one-shot `opencode run` starts its own server, so
**every** one-shot session is a first session. Journaling covers someone working against a running
server, and not someone invoking OpenCode a command at a time.

**A git worktree keeps its own journal, and that is a decision rather than an accident.** A
worktree is where the work actually ran, so its sessions are journalled under the worktree's own
`aidd_docs/runs/`, not under the checkout it shares history with. A report asked from the main
checkout therefore does not see them, and one asked from the worktree sees only its own. Nothing
joins the two today: reading a worktree's sessions means asking from inside it, or naming the
session directly.

What has changed is that a reader who gathers several journals can now tell them apart. A session
started inside a linked worktree records `worktree_id` and `worktree_repo_id` on its `session_start`
line, so two worktrees of one repository are no longer indistinguishable. A plain checkout records
neither key, which is what keeps "no worktree" from reading as a worktree named nothing. No report
groups on the field yet.

A session can still be named directly, which is how one outside a journal is reached:

```bash
aidd telemetry read --session ses_...
```

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
