# memory/ - Project Memory

Structured context the AI assistant reads at the start of a session, so it does not rediscover the project each time.

## How it loads

```mermaid
flowchart LR
    bank["memory/*.md"] -->|every session| ai(["AI context"])
    notes["internal/ · external/"] -.->|on demand| ai
```

The root files load every session through the project memory block in each AI context file. `internal/` and `external/` load only when relevant.

## Files

Refreshed automatically by the memory hook. Do not edit by hand.

<!-- files:start -->
- [architecture.md](architecture.md)
- [backlog.md](backlog.md)
- [cli.md](cli.md)
- [codebase-map.md](codebase-map.md)
- [coding-assertions.md](coding-assertions.md)
- [deployment.md](deployment.md)
- [ecosystem.md](ecosystem.md)
- [project-brief.md](project-brief.md)
- [testing.md](testing.md)
- [vcs.md](vcs.md)
<!-- files:end -->

## Maintaining it

The AI writes and refreshes these files. When you edit one by hand:

- One file per concern (architecture, database, vcs, ...).
- Capture the macro and the non-derivable. Point to the code, never copy it.
- Current state only, kept small. No personal notes, no future TODOs.

## Subdirectories

- `internal/`: AIDD workflow traces (the capability profile, audit notes, learn captures).
- `external/`: external references the project pulls in (specs, design docs).
