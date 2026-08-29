# 02 - Run it, and present every line it printed

Ask `aidd` whether the chain is recording, end to end, and hand back exactly what it found.

## Input

A confirmed `aidd` command, from locate.

## Output

Every line `aidd telemetry check` printed, unchanged: the stated half first — what is in
place — then either the four claims, or the one line it prints when it stops before
judging anything.

## Process

1. **Run it.**

   ```bash
   aidd telemetry check
   ```

   It takes no arguments and reads the current project.
2. **Relay what is in place first, always.** Before any verdict it states whether
   measurement is allowed and from which file, whose choice that was, whether an identity
   is attached, where records would land, and whether the recorder is declared — never a
   count or a figure. This is not a claim and carries no `ok`/`FAIL`/`--`; present it even
   when what follows stops immediately.
3. **Measurement off stops here.** After the stated half, if the next line says measurement
   is off, relay that line and stop — there is nothing to check until it is turned on, and
   no failure to report. The output is never only that one line: what is in place still
   printed above it.
4. **Not a git repository stops here too.** Relay that line and stop, the same way. The
   hook writes into the repository's own tree; outside one it has nowhere to write, which
   is a fact about the project, not a hook that failed to fire — never relay it as "hook
   fired FAIL".
5. **Present every remaining line, in the order printed.** Four claims, then any tool
   nothing here can read. Add nothing that sums them: a line summarising the others is
   where a failure hides.
6. **No run file yet is not always a failure — and an existing run file is never read as
   "no run file" at all.** Which of four readings applies is decided by reading, never
   guessed from the absence itself:
   - The recorder is declared (the stated half already named where), and no run file has
     appeared anywhere: reads `--`, nothing to evaluate — a declaration is not proof the
     hook will fire, only that it was asked for.
   - The recorder is declared nowhere this build checks, and no run file has appeared
     anywhere: reads `FAIL`, naming the recorder itself as declared nowhere.
   - The stated half's own `recorder declared` row itself said "could not be read": reads
     `--`, since whether the recorder is declared could not be read — a damaged declaring
     file is never promoted into a guess that the recorder is missing.
   - A run file exists but none carry a readable session_start to anchor them (a torn
     write, or a hooks block that registers another event without `SessionStart`): reads
     `FAIL` regardless of the recorder's own declaration, since a file this build can see
     is never "no run file" about.

   Every one of these is distinct from a hook that already ran and stopped: a run file
   that exists, carries its own session_start, but is not this session's own reads as this
   session leaving no run file, naming how stale the newest one is — a hook that died
   since the last one, not a hook that never worked.
7. **Read `--` as nothing to evaluate, never as passing.** It means an earlier claim
   already explains why this one has no material to check, and that earlier line is where
   the reason lives.
8. **An untrusted hook is not a hook that never fired, declared or not.** Codex trusts a
   hook per exact event name: a hook approved under an old event name reads untrusted, the
   same as one never approved at all, and this reading wins ahead of the declared/nowhere
   split above. Only an **absent** `config.toml` falls back to the declared/nowhere
   reading; one that exists but approves nothing reads untrusted, the same as an old event
   name — a `config.toml` existing is itself Codex's own answer, not a blank to guess at.
9. **A tool marked not covered is never counted toward health.** Its line carries its own reason, read from the same place the cost skill reads it, and stays separate from the four claims.

## Test

| Case | Pass |
| --- | --- |
| Any run | what is in place is relayed first, and is never itself `ok`/`FAIL`/`--` |
| Measurement is off | the stated half is relayed, then that single line, and the run stops before checking anything |
| Not a git repository | the stated half is relayed, then that single line, and the run stops before checking anything — never read as "hook fired FAIL" |
| A healthy install | all four claims read `ok`, each carrying what it was read from |
| The recorder is declared and no run file has appeared yet | hook fired reads `--`, nothing to evaluate — not `FAIL`, and the reason names that a declaration is not proof |
| The recorder is declared nowhere and no run file has appeared | hook fired reads `FAIL`, naming the recorder as what is missing |
| The recorder declaration itself could not be read | hook fired reads `--`, since whether the recorder is declared could not be read — never `FAIL` off a guess |
| A run file exists but none carry a readable session_start | hook fired reads `FAIL`, whatever the recorder's own declaration says — never "no run file" about a file that exists |
| A run file exists but predates this session | the line reads this session left no run file, distinct from never having fired, whatever the recorder's declaration says |
| Only `session_start` was written | that claim alone reads `FAIL`; the claims after it read `--` or `ok`, never `FAIL` for the same reason |
| An untrusted Codex hook, approved under a different event name | hook fired reads untrusted, ahead of either declared/nowhere reading |
| Codex's `config.toml` is absent entirely | hook fired falls back to the declared/nowhere reading, never a guess at trust |
| A tool is not covered | its line names the tool and its reason, and is not read as a fifth failing claim |
