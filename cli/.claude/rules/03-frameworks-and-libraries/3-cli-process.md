---
paths:
  - "src/cli.ts"
  - "src/presentation/**/*.ts"
---

# The CLI Process

## It exits as soon as the action resolves

Never fire and forget. An `unref()`ed handle or a floating promise loses the race with process
exit: the side effect never runs, the feature is silently dead, and every unit test stays
green because a mocked fetch is awaited in a process nothing is trying to end.

Deferred work therefore takes one of three shapes:

- piggyback it on a command already paying for network I/O, and await it there
  (`ONLINE_COMMAND_PATHS` in `cli.ts` is that list),
- await it on the hot path behind a hard timeout,
- or spawn a detached child that outlives the parent.

The hot path stays read-only and offline: read the cache, print, return. Startup never blocks
on the network.

A feature whose value is an observable side effect (a file written, a cache refreshed, a
request sent) is asserted against the real built binary, in an e2e test or `pnpm smoke`. Green
typecheck, unit and coverage runs say nothing about whether it fires.

## Channels

- `stdout` carries nominal output: info, success, printed results.
- `stderr` carries signals: debug, warnings, errors.
- A conflict or a skip is a `warn`, never an `error`. The command did what it could, and the
  user still gets the rest.
- The final summary is one line.

## Who formats

`CLIOutput` routes a message by level and does nothing else: no `exit()`, no `formatBytes`, no
counting. Rendering a result belongs to `presentation/display/`; deciding what the result is
belongs to the use case that produced it.

## Exit codes

`0` when the command did what it was asked, `1` on a thrown error, an unhealthy `doctor`, or a
guard that cannot be satisfied without a TTY.

A thrown error leaves through `errorHandler.handle`, which is the only catch and the only
place a domain failure becomes an exit code. A command may also end the process itself, at the
action level, for a refusal it decides before any use case exists: a missing flag, a
non-interactive guard, a per-item failure count. Nothing deeper does: no file under
`contexts/`, `kernel/` or `runtime/` calls `process.exit`, because a library that exits cannot
be tested and cannot be reused.
