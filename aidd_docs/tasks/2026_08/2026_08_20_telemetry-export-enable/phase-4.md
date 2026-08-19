---
status: done
---

# Instruction: the journeys

Part of [`plan.md`](./plan.md).

An end-to-end test that runs the real binary against a real temporary repository,
because every unit below it can pass while the command still writes to the wrong
file.

## Tasks to do

### `1)` The round trip

1. `cli/tests/e2e/telemetry.e2e.test.ts`: `on`, `on` again, `off`, on a
   repository whose settings file already holds unrelated content.
2. Assert the file is byte-identical before and after the whole journey. That
   single assertion is worth more than the three it replaces.

### `2)` The guarded scope, and the tools we cannot enable

1. `--scope project` without `--yes` writes nothing and exits non-zero.
2. `--scope project --yes` writes the tracked file, and the local one is
   untouched.
3. With Cursor present, the run reports it as not enableable by us and still
   succeeds — a tool we cannot configure is not a failure, but claiming it was
   configured would be.

### `3)` Strip the git environment

1. Build every child process's environment without its `GIT_*` variables.

> Not a precaution. The telemetry journal's own tests shipped with this bug and it
> surfaced when a commit ran them through `lefthook`: git exports `GIT_DIR` inside
> a hook, so `git init` in a temporary directory operated on **the real
> repository** instead. The failure was loud there; a test that merely reads
> would have been silently wrong instead.

### `4)` The one thing an e2e test can prove and a unit test cannot

1. Assert the path actually written, not the path the code intended to write.

> Scope resolution is the whole risk of this command. A unit test asserts a
> string; only running the binary proves it landed there.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Enable, re-enable, disable leaves the settings file byte-identical, unrelated content included |
| 2 | The unguarded `--scope project` writes nothing at all, checked on disk rather than from the exit code |
| 2 | A tool that cannot be enabled is reported as such, and never counted as enabled |
| 2 | With the AIDD switch off, no tool is configured at all |
| 3 | The suite passes with `GIT_DIR` exported, proving it under a git hook |
| 4 | The assertion reads the file at the resolved path, never a value the command reported |
