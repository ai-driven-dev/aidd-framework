---
status: pending
---

# Instruction: a period breaks down by it

## Architecture projection

```txt
.
└── cli
    ├── src
    │   ├── domain/models/cost-report.ts                     ✏️
    │   ├── domain/models/cost-report-envelope.ts            ✏️
    │   ├── application/use-cases/telemetry/report-cost-use-case.ts ✏️
    │   ├── application/display/cost-report-artefact.ts      ✏️
    │   ├── application/display/cost-report-display.ts       ✏️
    │   └── infrastructure/deps.ts                           ✏️
    └── tests
        ├── domain/models/cost-report-backlog.unit.test.ts   ✅
        └── e2e/telemetry-backlog-axis.e2e.test.ts           ✅
```

## User Journey

```mermaid
flowchart TD
  A[records grouped by the task they were written into] --> B[each task's folder is asked what it delivers]
  B --> C[one row per backlog item]
  B --> D[one row for tasks declaring none]
  A --> E[records in no task keep the reasons they already have]
  C & D & E --> F[the rows sum to the period total]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    a period whose records fall in two tasks, one declaring a backlog item and one declaring none, plus records in no task => something to break down: 5: cli
  section Happy path
    report by backlog item => one row for the declared item: 5: cli
    read the rest => one row for the task declaring none, and the no-task reasons unchanged: 5: cli
    sum every row => the same total the period reports: 5: cli
    compare with the task breakdown => the same total again: 5: cli
  section Edge case - a damaged declaration
    a task whose declaration does not parse => report => its own row saying so, every figure intact: 1: cli
  section Edge case - two tasks, one item
    two task folders declaring the same item => report => one row, both tasks' records in it: 1: cli
  section Teardown
    check every task folder => byte-identical to before the report ran: 5: system
```

## Tasks to do

### `1)` Group by what a task delivers

> This composes on the task grouping that already exists; it does not replace it.

1. Resolve each task the period's records fall into to what its folder declares, once per task rather than once per record.
2. Key a record on the item its task declares. A task declaring none keys on a symbol, the technique already used for the unknown rows, so it can never collide with a real item.
3. Records in no task at all keep the three reasons they already carry, untouched.
4. Two tasks declaring the same item land in one row; that is the point of the axis.

### `2)` The row and the envelope

1. Declare the row: the item when there is one, its totals, and where the declaration came from.
2. Add it to the envelope. If the version rises, enumerate every consumer and update them in the same commit — the consumer set has been exactly enumerable each of the three previous times.
3. Add the axis to the artefact and the terminal rendering, carrying the same reconciliation the other axes do.

### `3)` The read stays a read

1. Assert, end to end, that running the report leaves every task folder byte-identical.
2. A damaged declaration costs its own row's resolution and no figure anywhere.

## Test acceptance criteria

| Task | Acceptance criteria                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | A period breaks down by backlog item, over a chosen period                              |
| 1    | A task declaring none is its own row, distinct from records in no task                  |
| 1    | Two tasks declaring one item produce one row                                            |
| 2    | The rows reconcile to the same total as the task, step, model, person and project axes   |
| 2    | Every envelope consumer is updated in the same commit as any version rise               |
| 3    | Every task folder is byte-identical after the report runs                               |
| 3    | A damaged declaration costs no figure                                                   |
