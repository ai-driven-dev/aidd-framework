← [aidd-framework](../../README.md)

# aidd-telemetry

Know what a piece of work cost — tokens, models, and which skill spent them.

> Status: alpha. Proven end to end on Claude Code; see [Coverage](#coverage) for the rest.

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

Install the plugin through your tool's own mechanism, then ask your AI tool for a skill.
You never type a command yourself:

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

```bash
npm install -g @ai-driven-dev/cli
```

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
`~/.config/aidd/telemetry/`. `report` reads only that.

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
| **Claude Code** | ✅ proven on live sessions | ✅ stated by the tool, and by interval | ✅ |
| **Codex** | ✅ on captured rollouts | ✅ by interval | ✅ observed |
| **OpenCode** | ✅ | ✅ through its own plugin API, not a declarative hook | ❌ |
| **Copilot** | ⚠️ session total only, no per-request figure — one cumulative total at `session.shutdown`, never a sum of requests | ✅ by interval ([#663](https://github.com/ai-driven-dev/framework/issues/663)) | ❌ |
| **Cursor** | ❌ no token count in any file it writes | ✅ headless fires `sessionEnd` where interactive fires `stop`; both are mapped | ❌ |

**No amount, anywhere.** No tool read locally writes a figure in currency. Reports give
tokens; turning tokens into money is a separate service's job.

### What the numbers do not say

- **Codex needs one interactive approval.** Its hook trust is per entry, and a headless run
  never sees the prompt — so a Codex session journals nothing until someone approves once,
  in an interactive session, and says nothing while it does not.
- **OpenCode misses a server process's first session**, and `opencode run` is always a first
  session. Measured, not asserted: one live `opencode 1.14.20` run (2026-08-31, started with
  `--print-logs`) shows the plugin's own event hook firing for roughly 38 events of other
  types, and its debug log shows `session.created` genuinely published on the bus after the
  plugin loaded — yet it never reached the hook. Two further runs neither confirm nor refute
  this: one without debug logging, one that captured no plugin events at all — see
  `scripts/__tests__/fixtures/README.md`, "OpenCode's two plugin events" for exactly what
  each run shows. `session.idle` (the turn-end signal) is unaffected and reaches every
  session.
- **Only Claude Code names the ticket.** The others report by period and by step, never by
  task, because nothing they write carries one.
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

**The figures** stay with the person — `AIDD_USER_CONFIG_DIR`, or `~/.config/aidd/telemetry/`
when that variable is unset. A session's consumption belongs to whoever ran it, not to
whichever checkout was open at the time. Point `AIDD_USER_CONFIG_DIR` at a directory a
team shares, or a CI's own per repository, and every figure this plugin writes follows it
— at the cost that anything outside the default is not swept together with the rest of a
person's figures by a reader that assumes it. The default stays the default. On Windows
that default is `%APPDATA%\aidd\telemetry\` instead — `.config` is not where a Windows
application puts this — unless a machine already journalled under the old `.config` path,
which it keeps using rather than losing access to what was already written there.

**The identity file never follows `AIDD_USER_CONFIG_DIR`.** It is read from the OS
profile only, on every platform, by design — see `aidd telemetry identity` above. So on a
sink shared through that variable, a colleague's records stay `unresolved` in every
reader's report until that reader deliberately runs `aidd telemetry identity link` on the
colleague's identifier — nothing about a colleague's own identity arrives on its own, and
nothing stops a reader typing an identifier they never opted into. Linking one folds that
spend into the reader's own row from then on: it declares "this identifier is me", and the
CLI cannot check the claim against anything the colleague wrote.

## Where things are written down

- [`aidd_docs/runs/README.md`](../../aidd_docs/runs/README.md) — what the journal records,
  and what it deliberately does not.
- [`cost-report-contract.md`](../../aidd_docs/product/cost-report-contract.md) — the object
  a skill consumes.
- [`metrics-contract.md`](../../aidd_docs/product/metrics-contract.md) — one stored line,
  for a service that prices them.
