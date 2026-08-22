---
status: done
---

# Instruction: A real multi-step flow reconciles

## Architecture projection

```txt
.
└── aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/
    └── measurements.md   ✏️ what a real SDLC chain cost, step by step
```

## User Journey

```mermaid
flowchart TD
  A[a real task, run through several skills] --> B[each step opens and closes an interval]
  B --> C[the report gives one row per step]
  C --> D{does the breakdown add up to the total?}
  D -->|yes| E[the figure can be cited]
  D -->|no| F[the reconciliation names what it could not place]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    one real session, several skills, on a small task: 5: system
  section Happy path
    the report gives a row per step, and they sum to the total: 5: plugin
  section Edge case - interleaved skills
    a step opened inside another => the intervals close in the order they opened: 1: plugin
  section Edge case - work outside any step
    reported unattributed, never folded into the nearest step: 1: plugin
```

## Tasks to do

### `1)` Run one real chain and read it back

> One skill gives two rows. Interval closing, reconciliation across steps and interleaving stop being unit tests only when a real chain produces them.

1. Run a real multi-step flow on a small task, on a tool where the chain is proven.
2. Read it back: one row per step, and the rows sum to the total. What cannot be placed reads unattributed rather than being folded into the nearest step.
3. Write down what it cost, per step and in total, as the first citable figure this layer has produced.

### `2)` Close the milestone on evidence

> The epic asks that one skill answer what a task cost and prove no session was silently lost. Both halves now exist; this is where they are shown together.

1. The diagnostic and the report are run against the same real task, and their answers agree about which sessions exist.
2. Each of the epic's boundaries is stated as met or deliberately excluded, with the tool coverage as it actually stands rather than as it was scoped.
3. What remains open is named, so closing the milestone is not read as claiming the excluded tools work.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------ |
| 1    | A real multi-step flow reports one row per step                          |
| 1    | The breakdown reconciles to the total                                    |
| 1    | Work outside any step reads unattributed                                 |
| 2    | The diagnostic and the report agree on which sessions exist              |
| 2    | Every epic boundary is stated as met or excluded, against real coverage  |
