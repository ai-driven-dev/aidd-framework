---
description: Apply to the process, its channels and its exit codes; the CLI exits when the action resolves.
paths:
  - "src/cli.ts"
  - "src/presentation/**/*.ts"
---

# The CLI Process

## Exit

- Never fire and forget: `unref()` and floating promises die with the process.
- Deferred work rides an online command (`ONLINE_COMMAND_PATHS` in `cli.ts`), awaits behind a timeout, or runs detached.
- The hot path is offline: read cache, print, return.
- Assert a side effect against the built binary (e2e or `pnpm smoke`).

## Channels

- `stdout`: info, success, results.
- `stderr`: debug, warnings, errors.
- A conflict or skip is `warn`, never `error`.
- One-line final summary.

## Formatting

- `CLIOutput` routes by level, nothing else.
- Rendering: `presentation/display/`. Deciding: the use case.

## Exit codes

- `0`: did what was asked.
- `1`: thrown error, unhealthy `doctor`, guard needing a TTY.
- `errorHandler.handle` alone turns a domain failure into a code.
- A command may exit on a pre-use-case refusal: missing flag, non-interactive guard.
- Nothing under `contexts/`, `kernel/`, `runtime/` calls `process.exit` (`biome-plugins/no-process-exit.grit`).
