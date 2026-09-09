# memory/ - Project Memory

Structured context the AI assistant reads at the start of a session, so it does not rediscover the project each time.

## How it loads

- The files at the root of `memory/` are referenced by the project memory block in the AI context file and load every session.
- `internal/` and `external/` are listed there too, but load on demand, only when relevant.

## Files

The list below is refreshed automatically by the memory hook. Do not edit it by hand.

<!-- files:start -->
- [architecture.md](architecture.md)
- [auth.md](auth.md)
- [cli.md](cli.md)
- [codebase-map.md](codebase-map.md)
- [coding-assertions.md](coding-assertions.md)
- [deployment.md](deployment.md)
- [ecosystem.md](ecosystem.md)
- [project-brief.md](project-brief.md)
- [telemetry.md](telemetry.md)
- [testing.md](testing.md)
- [vcs.md](vcs.md)

Read on demand:

- [internal/decisions/self-update-version-source-npm.md](internal/decisions/self-update-version-source-npm.md)
<!-- files:end -->

## How to maintain it

- One file per concern (architecture, database, vcs, ...).
- Capture the macro and the non-derivable. Point to the code, do not copy it.
- Keep each file small, well under 200 lines.
- Update a file when the underlying reality changes.
- Current state only. Never personal notes or future TODOs.

## Subdirectories

- `internal/`: AIDD workflow traces (the capability profile, audit notes, learn captures).
- `external/`: external references the project pulls in (specs, design docs).
