# Reference: dependency wiring + CLI output

How a command obtains its dependencies and how it talks to the user.

## Dependency factories

- `createDeps(projectRoot, globalOptions, output)` — full dependency graph. Command actions only.
  Memoized by `projectRoot`; the `preAction` hook is always the first caller per root, so
  commands reuse the cached instance with no extra I/O. No second cache layer in command files.
- `createMenuDeps(projectRoot)` — minimal: `ManifestRepository` + `Prompter`. Pre-parse only
  (the interactive menu before `program.parse()`).
- **Never instantiate adapters directly** in a command or in `cli.ts` (`new GhCliAdapter()`,
  `new CurrentVersionAdapter()`, etc. are forbidden). If pre-parse needs grow, extend `createMenuDeps`.

## cli.ts body rules

- `createMenuDeps` only before `program.parse()`
- Never call `createDeps` before `program.parse()`
- `cli.ts` wires commands and global flags only — zero business logic, zero adapter construction

## CLI output channels

`CLIOutput` (lives in `presentation/output.ts`, the documented hexagonal exception) routes by level:

- **stdout** — nominal output: `output.info()`, `output.success()`, `output.print()`
- **stderr** — signals: `output.warn()`, `output.error()`
- Conflicts and skips → `warn`, never `error`
- `process.exit(1)` only via `errorHandler.handle(error)` in the catch block (or a flag guard)

## CLIOutput contract

- Zero logic: it only routes messages by log level
- No `exit()` method — error handling belongs in `ErrorHandler`
- No helper methods (`formatBytes`, `formatCounts`, …) — formatting belongs in use-cases or
  domain models, never in the output adapter or the command

## Display helpers

Multi-step display logic (banners, result summaries, progress output) that uses `CLIOutput` must
not live in the command file itself. Extract to `src/presentation/display/<command>-display.ts`.
Pure domain formatters (no `CLIOutput` dependency) belong in `src/domain/models/`.
Parser helpers that convert CLI strings into typed domain values belong in
`src/domain/models/<model>.ts` or remain inlined if ≤5 lines and used only once.
