---
status: pending
---

# Instruction: The sink carries the order

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
├── cli/src/domain/models/
│   └── telemetry-sink-record.ts                                    ✏️ the ordering attribute joins the allowlist
└── cli/tests/domain/models/
    └── telemetry-sink-record.unit.test.ts                          ✏️ ordering survives a shared millisecond
```

## User Journey

```mermaid
flowchart TD
  A[An export arrives at the receiver] --> B[Map each billed record through the allowlist]
  B --> C{Does the record carry a sequence number?}
  C -- yes --> D[Store it beside the timestamp]
  C -- no --> E[Store the timestamp alone]
  D --> F[A reader can order the session exactly]
  E --> G[A reader orders by time, and can see that is all it has]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    load the captured export fixtures already in the repo => real records to map: 5: system
  section Happy path
    map a captured export => every stored record carries the sequence number the export sent: 5: api
  section Edge case - shared millisecond
    two records one sequence apart sharing a timestamp => order them from stored data alone => the order is unambiguous: 1: api
  section Edge case - no sequence number
    an export carrying no sequence number => map it => the record stores the timestamp and nothing invented: 1: api
  section Edge case - allowlist discipline
    an export carrying an attribute outside the allowlist => map it => that attribute is absent from the stored line: 1: api
```

## Tasks to do

### `1)` Let the ordering through

> The mapper stores an allowlist and nothing else. The attribute that orders a session is not on it, so today it is discarded on arrival and cannot be recovered later.

1. Add the export's sequence attribute to the allowlist in `cli/src/domain/models/telemetry-sink-record.ts`, beside the timestamp already there.
2. Keep it numeric, like the other counted fields.
3. Change nothing else about what is stored. The reader that consumes the order is #629, not this phase.

### `2)` Prove it settles what the timestamp cannot

> The reason for this phase is a measured collision, so the test must reproduce the collision.

1. Assert against the captured export fixtures that a record one sequence apart from another, sharing a millisecond, is ordered unambiguously from the stored lines alone.
2. Assert that an export carrying no sequence number stores the timestamp and invents nothing.
3. Assert the allowlist still holds: an attribute outside it is absent from the stored line.

## Test acceptance criteria

| Task | Acceptance criteria                                                                              |
| ---- | -------------------------------------------------------------------------------------------------- |
| 1    | Every stored record carries the sequence number its export sent                                     |
| 1    | Nothing else about the stored shape changes                                                         |
| 2    | Two records sharing a millisecond are ordered unambiguously from stored data alone                  |
| 2    | An export with no sequence number stores the timestamp and no substitute                            |
| 2    | An attribute outside the allowlist never reaches a stored line                                      |
