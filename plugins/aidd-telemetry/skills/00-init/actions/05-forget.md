# 05 - Take it back

Two different asks reach here, and neither requires the other: stop new records carrying
this person's identifier, or remove everything this tool measured. A person who never
opted into naming themselves can still ask for the second.

## Input

A confirmed `aidd` command, and which of the two this person is asking for.

## Output

Either the user-scoped `identity.json` removed (naming withdrawn only, nothing already
stored touched), or this project's run journal, this machine's stored records, and this
machine's identity file all gone (everything measured removed) — in both cases, a person
who knows exactly what happened, what stayed, and what no command here can touch.

## Process

1. **Tell the two apart, if not already clear.** Ask which this person means:
   - **Withdraw naming** — stop attaching their identifier to new records. Opting in
     again later mints a fresh identifier; nothing already stored is touched or deleted.
   - **Remove everything measured** — irreversible. This project's run journal, this
     machine's stored records (spanning every project ever measured on this machine, not
     only this one), and this machine's identity file are all deleted.

2. **Withdraw naming.** Run `aidd telemetry identity status`.
   - Already off: relay it and stop.
   - Otherwise, run `aidd telemetry identity off` and relay everything it prints: new
     records carry no person from this moment; records already stored keep the identifier
     they were written with, unchanged — nothing is deleted or rewritten in the sink
     itself; and opting in again later mints a fresh identifier, never the one just
     withdrawn.

3. **Remove everything measured.**
   1. Run `aidd telemetry forget` (without `--yes`) and relay exactly what it shows: every
      location it names, roughly how much is in each, and what history keeps. A journal
      tracked by git right now is relayed as certainly held by history; one not tracked is
      relayed as possibly held, if it was ever committed before — never as an all-clear.
      Never say history is removed, or offer to remove it: no command here rewrites git
      history.
   2. Nothing was ever measured: relay that and stop — there is nothing to confirm.
   3. Ask this person to confirm, having seen exactly what would go and what stays out of
      reach.
      - Declines: stop, and say plainly that nothing was removed.
   4. Run `aidd telemetry forget --yes` and relay what it reports: what went, in the same
      counts already shown; what did not, per thing, with why; and that the telemetry
      switch itself was untouched — measurement can be turned on again with
      `aidd telemetry on --yes`.

## Test

| Case | Pass |
| --- | --- |
| Withdraw naming, was identified | `identity.json` is removed; the message names what stays and what starts fresh |
| Withdraw naming, was never identified | nothing changes, and it says so rather than erroring |
| Withdraw naming | records already stored are untouched — this path only stops what happens next |
| Remove everything, confirms | the run journal, the sink and the identity file are all gone; the counts relayed match what the preview showed |
| Remove everything, declines | nothing is removed, and it is said plainly, not as an error |
| Remove everything, nothing was ever measured | it says so and asks nothing |
| Remove everything, a tracked journal | history is relayed as certainly held, never as removable |
| Remove everything, an untracked journal | history is relayed as possibly held, never as an all-clear |
| Remove everything | the telemetry switch is untouched; a later `aidd telemetry on --yes` still works |
