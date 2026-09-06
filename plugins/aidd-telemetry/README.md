← [aidd-framework](../../README.md)

# aidd-telemetry

Know what a piece of work cost — tokens, models, and which skill spent them.

> Status: beta — usable, and being proven. Proven end to end on Claude Code; see
> [Coverage](#coverage) for what each of the other four answers, and what none of them does.
> It stays off the curated install path until it has run on other people's machines, not
> until that table is all green: two of its rows are limits of the tool, not of this plugin.

Providers can tell you a developer burned four million tokens on Tuesday. None can tell you
that `aidd-dev:02-implement` spent 78,188 of them. The difference is the task, the step and
the skill — what the framework knows and a provider does not.

**Nothing is measured until you say so.** No command, server, or route in this plugin sends
anything anywhere — the export writer this plugin used to ship is deleted from the code. If
you ran `aidd telemetry endpoint` on an older version, that is a fact about a settings file
this plugin can no longer see or touch: `aidd telemetry check` and `aidd telemetry off` both
detect a settings file still carrying what it wrote, and name exactly what to remove by
hand.

## Install and use

Install it with the CLI:

```bash
npm install -g @ai-driven-dev/cli
aidd plugin install aidd-telemetry
```

Your tool's own plugin mechanism works too, and the plugin records identically either way.
The CLI is recommended for one reason: **nothing here can be read without it.** Allowing
measurement and answering what it cost both go through `aidd`, so a person installing the
other way still ends up needing it — and until they run it, the install has recorded no
version of this plugin anywhere, which `aidd telemetry check` will tell them.

Then ask your AI tool for a skill. You never type a command yourself:

- **`00-init`** — allows measurement for this project, and verifies the switch took.
- **`01-cost`** — answers what a period or one task consumed.
- **`02-check`** — answers whether the chain is actually recording.

All three reach the CLI, and each checks that `aidd` answers before doing anything —
stopping with the reason when it does not, rather than reporting an empty figure in place
of a missing tool.

**Three acts, and only the middle one needs nothing.**

| | Needs |
| --- | --- |
| **Allowing** it, once per project | the `aidd` CLI |
| **Recording**, every session after that | nothing — the hooks run under plain `node` |
| **Answering** what it cost | the `aidd` CLI |

Recording is the act that must never depend on anything: it runs on every tool call, and a
hook that needs an installed binary records nothing, silently, when that binary is missing.
Allowing and answering can afford the CLI, and answering in particular belongs there — the
report is computed once, in one place, so the figure cannot differ depending on who asked.

Your sessions are measured from the moment you allow it, whether or not `aidd` is present.
Without it you cannot ask what they cost — recording keeps going, and the answer waits.

```
period    2026-08-21 to 2026-08-21

  sessions                  1
  requests                  3
  tokens                    116,678    80% cache
  cost                      amount unknown

  by step    of tokens
    aidd-ui:01-hello           67%   78,188 tokens    stated by the tool
    aidd-ui:01-hello           33%   38,490 tokens    from a journal interval
```

`report --json` prints the same figures as one object a program can parse —
[the contract](../../aidd_docs/product/cost-report-contract.md).

## How it works

Three parts, and the third is the only one that joins anything.

**The hooks journal.** While measuring is on, they append one line per observation to
`aidd_docs/runs/<run_id>__<vendor_id>.jsonl` — git-ignored, one file per session, never
rewritten. Which session, which skill was running when, which files inside a task folder
changed. **No token, no cost, no model ever lands there.**

**Your AI tool writes its own transcript**, in its own place, in its own format. It holds
the tokens and knows nothing about AIDD skills.

**`read` joins the two.** It opens the transcript, normalises it into one shape whatever
tool produced it, matches each record against the journal, and stores the result under
`~/.config/aidd/telemetry/`. `report` reads that store — and, before it answers, joins
any session the journal names that the store has not caught up with, so **you never
have to run `read` to get a figure**. `read` stays the command for asking what each
tool answered, one line per tool, rather than a total.

The join cannot happen live: when a hook fires, the tokens for that turn are not written
yet.

## What a figure tells you about itself

Every attributed figure says **how** it was attributed, because the two ways are not the
same claim:

| Reads | Means |
| --- | --- |
| stated by the tool | the tool named the running skill itself, on the line with the counters — exact |
| from a journal interval | derived from the interval between two boundaries the framework recorded — an inference |
| unattributed | neither source could say |

**`unattributed` never means "no step ran".** On at least one measured tool the two are
indistinguishable, so the stronger reading would be a fact nobody measured.

The same rule runs through everything here: **an absent figure is named, never shown as a
zero.** A tool that cannot be read, one that carries no amount, one that measured nothing,
and one whose reader failed are four different answers.

## Coverage

| Tool | Tokens | Step | Task |
| --- | --- | --- | --- |
| **Claude Code** | ✅ proven on live sessions | ✅ stated by the tool, and by interval | ✅ observed |
| **Codex** | ✅ on captured rollouts | ✅ by interval | ✅ observed |
| **OpenCode** | ✅ | ✅ through its own plugin API, not a declarative hook | ✅ observed |
| **Copilot** | ⚠️ session total only, no per-request figure — one cumulative total at `session.shutdown`, never a sum of requests | ✅ by interval ([#663](https://github.com/ai-driven-dev/framework/issues/663)) | ✅ observed |
| **Cursor** | ❌ no token count in any file it writes | ✅ headless fires `sessionEnd` where interactive fires `stop`; both are mapped | ✅ observed |

**No amount, anywhere.** No tool read locally writes a figure in currency. Reports give
tokens; turning tokens into money is a separate service's job.

### What the numbers do not say

- **Codex needs one interactive approval.** Its hook trust is per entry, and a headless run
  never sees the prompt — so a Codex session journals nothing until someone approves once,
  in an interactive session, and says nothing while it does not.
- **OpenCode never announces a session, so the plugin opens it.** Measured, not asserted:
  one live `opencode 1.14.20` run (2026-08-31, started with `--print-logs`) shows the
  plugin's own event hook firing for roughly 38 events of other types, and its debug log
  shows `session.created` genuinely published on the bus after the plugin loaded — yet it
  never reached the hook. Two further runs neither confirm nor refute this: one without
  debug logging, one that captured no plugin events at all — see
  `scripts/__tests__/fixtures/README.md`, "OpenCode's plugin events" for exactly what each
  run shows. `session.idle` (the turn-end signal) is unaffected and reaches every session.
  Since a session nobody announced would otherwise leave the journal with no run file — and
  so drop the turn-end and every task declaration after it, for every `opencode run` there
  has ever been — the first call a session produces opens it, carrying the directory that
  call was already going to use. What is lost is only what `session.created` alone could
  have said: on a server serving more than one directory, a session it never announced is
  journalled under the plugin's own init-time directory rather than its own.
- **A task is declared from a tool call's own arguments, on every host now.** Claude Code,
  Codex, Copilot and Cursor each hand their hook a tool call whose own arguments can name a
  file under a task folder — a `Read`, a `Bash` command line, an object keyed `path` — and
  the journal reads that text rather than asking the host to cooperate. **OpenCode joined
  them 2026-08-31**, settled by a bounded measurement rather than assumed either way: a
  completed tool part's own arguments do reach the plugin's `event` hook
  (`message.part.updated`, `part.type: "tool"`, `part.state.status: "completed"`), and
  `hooks/opencode-plugin.js` reads them the same way. An earlier reading had found no tool
  part across three sessions; that was a model choosing not to call a tool, not a limit of
  the plugin surface — see `scripts/__tests__/fixtures/README.md`, "OpenCode's tool part"
  for what changed the answer and "The task-declaration payloads" for one real capture per
  host, taken live 2026-08-31 for four of the five, and for OpenCode the call the plugin
  builds from one such captured event.
- **These are raw counters, not your tool's usage screen.** A vendor's own page weights a
  cached token by what it charges for it; these figures are the counts the tool wrote down.
  The two disagree on cache lines by construction, and neither is wrong.
- **A period means when the work ran**, not when it was billed.
- **A sweep reaches a session only where the journal was installed.** Work done before you
  turned measurement on is not there, and nothing reconstructs it.

## Privacy

- **The switch lives in a file you commit or do not**, per project — which means it is
  git-tracked the moment someone commits it on, and applies to everyone who clones from
  then on, not only to whoever ran `aidd telemetry on`. Refuse it for yourself alone with
  `AIDD_TELEMETRY=0`, which overrides the file unconditionally.
- **No prompt, no code, no diff.** The stored shape is an allowlist, field by field, in
  [the record contract](../../aidd_docs/product/metrics-contract.md).
- **Nothing this plugin runs sends a record anywhere else.** Every code path that could —
  the export writer, its endpoint, the server it once talked to — is deleted; everything
  measured is read back from where it was written, on the same machine that wrote it. On a
  machine that ran an older version's `aidd telemetry endpoint`, that settings file is a
  fact this plugin cannot see or undo any more — `aidd telemetry check` and `aidd telemetry
  off` both detect it and name what to remove by hand.
- **`off` keeps what you measured.** It stops the recording, not the record — nothing
  already written is deleted. **`aidd telemetry forget` removes it**: this project's run
  journal, this machine's stored records (spanning every project ever measured on this
  machine, not only this one), and this machine's identity file. It shows exactly what
  would go, and what git history keeps regardless, before anything happens, and removes
  nothing without `--yes`. The telemetry switch itself is never touched — measurement can
  be turned back on afterwards.

## Where things live

**The journal** stays in the repository it describes — `aidd_docs/runs/`, git-ignored the
moment measurement is turned on, through `aidd setup`, `aidd plugin add`, or
`aidd telemetry on`. It is a property of that repository: every line names a
repository-relative path or a task folder, and moving it out would leave a file about one
repository with no way to say which. It records the repository, the task folders written
into, the skills run, and their timings — nothing else, and no person's name or identity.

**The figures** stay with the person — `AIDD_TELEMETRY_DIR`, or `~/.config/aidd/telemetry/`
when that variable is unset. A session's consumption belongs to whoever ran it, not to
whichever checkout was open at the time. Point `AIDD_TELEMETRY_DIR` at a directory a team
shares, or a CI's own per repository, and every figure this plugin writes follows it — at
the cost that anything outside the default is not swept together with the rest of a
person's figures by a reader that assumes it. The default stays the default. On Windows
that default is `%APPDATA%\aidd\telemetry\` instead — `.config` is not where a Windows
application puts this — unless a machine already journalled under the old `.config` path,
which it keeps using rather than losing access to what was already written there.

**Share `AIDD_TELEMETRY_DIR`, never `AIDD_USER_CONFIG_DIR`.** This document used to name
the second one here, and that was a mistake worth stating plainly: `AIDD_USER_CONFIG_DIR`
relocates a machine's whole aidd config, `auth.json` included — a GitHub token. Following
the advice as written put a credential in the directory a team was told to share. `0600`
holds on a local POSIX filesystem, but a network share or a synced folder is usually what
"a directory a team shares" means, and neither guarantees it; and whatever the mode, two
people pointing at one directory overwrite each other's token file. The figures are the one
thing here meant to leave a machine, so they have a name of their own and nothing else
follows it. `AIDD_USER_CONFIG_DIR` still moves the figures too, so a setup made before this
split keeps working — but it moves the token with them, and it should be changed.

**The identity file never follows either variable.** It is read from the OS
profile only, on every platform, by design — see `aidd telemetry identity` above. So on a
shared sink, a colleague's records stay `unresolved` in every
reader's report until that reader deliberately runs `aidd telemetry identity link` on the
colleague's identifier — nothing about a colleague's own identity arrives on its own, and
nothing stops a reader typing an identifier they never opted into. Linking one folds that
spend into the reader's own row from then on: it declares "this identifier is me", and the
CLI cannot check the claim against anything the colleague wrote.

## The backlog link

**A task folder can say which backlog item it delivers.** `aidd-pm:04-spec` and
`aidd-dev:01-plan` write `backlog-link.json` at the folder's own level — beside `spec.md`
and `plan.md`, never inside either — the moment the request they are building from names
one. A folder with no `backlog-link.json` is a normal state, never an error: most tasks
never declare one, and the report reads that exactly as it reads any other silence.

The file carries one meaningful field:

```json
{
  "backlog": "owner/repo#123",
  "written_at": "2026-08-21T09:00:00Z",
  "written_by": "aidd-pm:04-spec"
}
```

`backlog` names the item on whatever support it lives — a forge reference
(`"owner/repo#123"`) where the backlog lives with a ticket provider, or a
project-relative Markdown path (`"aidd_docs/backlog/tasks/x.md"`) where it lives as a file
— one field for both, never two, per
[`persistence.md`](../aidd-pm/skills/10-task/references/persistence.md)'s own rule of
keeping one authority across supports. `written_at` and `written_by` are provenance, not status: they say when
the declaration was made and by what, so a wrong one can be traced to the act that
produced it, not what the task itself is doing.

**It is a plain file, correctable by hand.** Open it, edit `backlog`, save it — the next
`aidd telemetry report` reads the file as it stands, never a cache, and never something it
derived and kept. Nothing here re-derives or overwrites a declaration that already exists:
the skills that write this file leave one already there untouched, exactly as a person's
own edit would expect.

**What it deliberately does not carry.** No steps, no produced-file list: `step_start` and
`file_written` already carry both, timestamped, in the run journal, and deriving which step
produced which file from that is the same interval mechanism task attribution already
uses — a second, hand-maintained copy here could disagree with the journal, and a copy that
can disagree is worse than none. No `branch`, no `pull_request`: git and the forge already
know both. No status: the artefacts' own frontmatter owns that. No second task identity:
the folder path already is one.

## Where things are written down

- [`aidd_docs/runs/README.md`](../../aidd_docs/runs/README.md) — what the journal records,
  and what it deliberately does not.
- [`cost-report-contract.md`](../../aidd_docs/product/cost-report-contract.md) — the object
  a skill consumes.
- [`metrics-contract.md`](../../aidd_docs/product/metrics-contract.md) — one stored line,
  for a service that prices them.
- [The backlog link](#the-backlog-link) above — the one file a task folder writes to say
  which backlog item it delivers.
