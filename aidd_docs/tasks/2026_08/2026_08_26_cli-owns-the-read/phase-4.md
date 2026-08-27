---
status: implemented
---

# Instruction: `aidd telemetry check` — the claims it can settle without reading an export

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete
>
> The check is split in two because it is ~1,100 lines with no CLI equivalent. This half ships
> a working command that answers the local claims and **states which claims it does not yet
> judge** — the same rule the figures obey: an unknown is never a silent pass.

```txt
.
└── cli
    ├── src
    │   ├── application
    │   │   ├── commands
    │   │   │   └── telemetry.ts                                    ✏️ the check subcommand, wiring only
    │   │   ├── display
    │   │   │   └── telemetry-check-display.ts                      ✅ a claim, its verdict, its reason
    │   │   └── use-cases
    │   │       └── telemetry
    │   │           └── diagnose-telemetry-use-case.ts              ✅ gathers evidence, then judges
    │   ├── domain
    │   │   └── models
    │   │       ├── telemetry-claim.ts                              ✅ the closed set of claims and verdicts
    │   │       └── session-anchor.ts                               ✅ which session this run is, per tool
    │   └── infrastructure
    │       └── adapters
    │           └── telemetry-evidence-adapter.ts                   ✅ switch, repository, journal, marker
    └── tests
        ├── application
        │   └── use-cases
        │       └── telemetry
        │           └── diagnose-telemetry-use-case.unit.test.ts    ✅ one test per claim and per reason
        └── e2e
            └── telemetry-check.e2e.test.ts                         ✅ the local claims, pinned against the script
```

## User Journey

```mermaid
flowchart TD
  A[Person asks whether it is recording] --> B[aidd telemetry check]
  B --> C{Is the switch on?}
  C -- no --> D[Stop at the switch, before judging anything else]
  C -- yes --> E{Is this a git repository?}
  E -- no --> F[Name that, and never blame the hook]
  E -- yes --> G{Did a hook fire?}
  G -- no --> H[Never fired, or an unrecognised payload — say which]
  G -- yes --> I[Local chain ok, and the export claims are stated as not yet judged]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Build a temp git project with the switch off => a project that records nothing: 5: system
  section Happy path
    Enable, journal a captured payload, run aidd telemetry check => the local chain reads ok: 5: cli
  section Edge case - measurement is off
    Switch off => run check => stops at the switch, before judging anything else: 1: cli
  section Edge case - not a git repository
    Remove .git => run check => names that, and never blames the hook: 1: cli
  section Edge case - the hook never fired
    Enable but journal nothing => run check => names the hook never firing: 1: cli
  section Edge case - an unrecognised payload
    Only the unrecognised marker present => run check => names the payload, not a hook that never ran: 1: cli
  section Edge case - a run file torn before session_start
    A run file with no parsable start => run check => names the hook never firing, never borrowing the payload's shape: 1: cli
  section Edge case - the claims not yet judged
    A healthy project => run check => the export claims are listed as not yet judged, never as passing: 1: cli
  section Teardown
    Remove the temp project => the machine's own state untouched: 5: system
```

## Tasks to do

### `1)` Name every claim before porting any of them

> The diagnostic's value is that it distinguishes reasons. That set is the contract, and it is
> written whole here even though this phase settles only part of it.

1. Enumerate every claim the current checker can make, from `diagnose.cjs`, as a closed union in `domain/models/telemetry-claim.ts`.
2. Give each a verdict and a reason, so "no run file" and "untrusted hook" can never collapse into one answer.
3. Mark the claims this phase does not settle, so the display can state them rather than omit them.

### `2)` The local evidence, behind one port

1. Port the switch, repository, journal and marker reads into `telemetry-evidence-adapter.ts`.
2. Port `session-anchor.cjs` into `domain/models/` — resolving which session this is, is a derivation, not I/O.
3. A read that fails becomes stated evidence, never a thrown error.

### `3)` The use-case gathers, then judges

1. Gather all evidence first, then judge, so a missing piece names itself instead of aborting the run.
2. Stop at the switch, in the order the journey shows.
3. Never let absent evidence produce an `ok`.

### `4)` Wire the command, and say what is not judged yet

1. Add `check` to `telemetry.ts` and a display printing claim, verdict and reason.
2. List the export claims as not yet judged, in the output itself.
3. Pin the local claims against `telemetry-check.cjs` on the same fixtures — the script is still present, and this is the window to compare.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | Every claim the current checker can make exists in the union, and no two distinct reasons share one verdict.                |
| 2    | A read that fails appears as stated evidence, and the run still produces a verdict for the other claims.                    |
| 3    | Measurement off stops at the switch; a non-repository names that and never blames the hook; absent evidence never yields `ok`. |
| 4    | On a healthy project the export claims are printed as not yet judged, and every local claim equals the script's on the same fixture. |
