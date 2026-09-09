---
status: pending
---

# Instruction: the skills that open a folder write it

## Architecture projection

```txt
.
└── plugins
    ├── aidd-pm/skills/04-spec/**                            ✏️
    ├── aidd-dev/skills/01-plan/**                           ✏️
    ├── aidd-orchestrator/skills/01-sdlc/references/01-frame.md ✏️
    └── aidd-telemetry/README.md                             ✏️
```

## User Journey

```mermaid
flowchart TD
  A[a skill opens a task folder] --> B{does the request name a backlog item?}
  B -- "yes" --> C[the folder declares it, with when and by what]
  B -- "no" --> D[no declaration — a normal folder]
  C --> E[a later run can correct it by hand]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    a request naming a backlog item, and one naming none => two ways in: 5: system
  section Happy path
    open a folder from a request naming an item => the folder declares it: 5: system
    open one from a request naming none => the folder declares nothing, and nothing errors: 5: system
    correct a declaration by hand => the report follows the file, not a cache: 5: cli
  section Edge case - the skill's account matches what is written
    the skill's own instructions => compared against the shape the reader accepts => they agree: 1: system
```

## Tasks to do

### `1)` Whoever opens the folder declares

> The link is knowable exactly when the folder is created, and guessable never.

1. The skills that create a task folder record the backlog item when the request names one — the SDLC's own Frame resolves a ticket, and that is the moment the item is known.
2. Where no item is named, nothing is written. A folder without a declaration is a normal folder.
3. The declaration records when it was written and by what, per the contract.

### `2)` Say it where a person will read it

1. Document the file, its one meaningful field, and both supports it accepts, where task folders are described.
2. State that it is correctable by hand, and that the report reads the file rather than any cache.
3. Say what it deliberately does not carry, and why: steps and produced files come from the journal, `branch` and `pull_request` from git.

### `3)` A guard against the skill and the reader drifting

1. The repository already pins a skill's account of a command against what the command does. Extend that family so the shape the skills write and the shape the reader accepts cannot diverge.
2. Prove it by mutating each side.

## Test acceptance criteria

| Task | Acceptance criteria                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | A folder opened from a request naming a backlog item declares it                    |
| 1    | A folder opened from a request naming none declares nothing, and nothing errors     |
| 2    | The file, its field and both supports are documented where task folders are described |
| 2    | A hand-corrected declaration changes what the report says                           |
| 3    | A guard fails if the skills and the reader disagree about the shape                 |
