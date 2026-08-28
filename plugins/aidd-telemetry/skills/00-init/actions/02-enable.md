# 02 - Ask, then turn measurement on

Get the user's agreement, then flip the one switch every component reads.

## Input

A confirmed `aidd` command, from check.

## Output

`.aidd/config.json` carrying `telemetry.enabled: true`, and a user who knows what it records.

## Process

1. **Say what it records, before asking.** It writes into `aidd_docs/runs/` which session served which task and which skill was running when. It records no prompt, no code, no diff, and no person's name or address. Nothing leaves the machine. Also say that `.aidd/config.json` — the file this is about to write — is git-tracked, so this turns measurement on for everyone who clones this repository, not only for this person.
2. **Ask.** Wait for a yes.
   - The user declines: stop, and write nothing.
3. **Turn it on.** Run `aidd telemetry on --yes` — the `--yes` confirms the consequence just explained, which merges into whatever the config already holds. The same run also adds `aidd_docs/runs/` to `.gitignore` — the journal belongs to this repository and is never offered to a commit.
4. **Relay what it prints about existing history.** If `aidd telemetry on --yes` names files under `aidd_docs/runs/` already tracked by git, say so plainly: the repository, the task folders written into, the skills run, their timings, and every file each session wrote is in that history now — no person's name or address. Nothing is removed or rewritten — what to do about it is the user's call, not this skill's.
5. **Say what it cannot recover.** The journal starts now, so sessions that already ran carry no step and no task and will read as unattributed.
6. **Say it is reversible, and what reversing keeps.** `aidd telemetry off` stops the recording from that moment; sessions already measured stay measured and still report.

## Test

| Case | Pass |
| --- | --- |
| The user agrees | `telemetry.enabled` is true and every other key survives |
| The user declines | the config file is unchanged |
| The config already held other keys | those keys are still there afterwards |
| Turned off after a session was measured | that session still reports the same figures |
| The journal is not yet in `.gitignore` | it is added, and nothing wider |
| A journal file is already tracked by git | the user is told what it contains; nothing is removed or rewritten |
