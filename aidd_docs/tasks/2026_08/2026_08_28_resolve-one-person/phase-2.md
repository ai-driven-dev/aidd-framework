---
status: pending
---

# Instruction: the person breakdown in the report

## Architecture projection

```txt
.
└── cli
    ├── src/domain/models
    │   ├── cost-report.ts                                  ✏️
    │   └── cost-report-envelope.ts                         ✏️
    └── tests/domain/models
        ├── cost-report-person.unit.test.ts                 ✅
        └── cost-report-envelope.unit.test.ts               ✏️
```

## User Journey

```mermaid
flowchart TD
  A[records read from the sink] --> B[group each by the person its identifier resolves to]
  B --> C[one row per mapped person]
  B --> D[one row per unplaced identity, labelled unresolved]
  B --> E[one row for records that carry no identifier]
  C --> F[every row carries the identities behind it]
  D --> F
  F --> G[the rows sum back to the report total]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    records from two identifiers one person declared, one identifier nobody declared, and one record with none => a report input: 5: system
  section Happy path
    build the report => the two declared identifiers are one row: 5: system
    read that row => it names both identifiers behind it: 5: system
    read the unplaced identifier => its own row, labelled unresolved: 5: system
    read the record with no identifier => its own row, labelled none: 5: system
    sum every person row => the report total, nothing double counted and nothing dropped: 5: system
  section Edge case - no mapping declared at all
    a report with a null mapping => build it => every identifier is unresolved and the figures are unchanged: 1: system
  section Edge case - the envelope is parsed by a program
    a consumer reading the envelope => build it => the person rows and their identities are present, and the report version was raised: 1: system
```

## Tasks to do

### `1)` Group by resolved person

> Mirrors `projectKeyOf` and its unknown row, one dimension over.

1. In `cli/src/domain/models/cost-report.ts`, add a person grouping key beside the existing project and model keys.
2. Key a `mapped` record on its canonical `personId`; key an `unresolved` record on the raw identifier it carried, never on a shared bucket, so two unplaced people never merge into one row.
3. Key a record with no identifier on a symbol, the same technique `NO_KNOWN_PROJECT` uses, so it can never collide with a real identifier.
4. Pass the mapping into the report builder as an argument, not as a module-level read: the domain stays free of where a mapping lives.

### `2)` The row

> A row that cannot be traced back to its identities fails the contract's audit condition.

1. Declare `CostReportPersonRow`: `resolution`, `person?`, `displayName?`, `identities: readonly string[]`, `totals`.
2. Add `byPeople` to the report, sorted largest first the way `byProjects` is, with `unresolved` rows and the `none` row placed after the mapped ones so a reader sees people before gaps.
3. Write `personRows`, mirroring `projectRows`.

### `3)` The envelope

> The shape a program already parses has to carry it, or the audit condition is only true in a terminal.

1. Add `CostReportEnvelopePersonRow` and `by_person` to `cli/src/domain/models/cost-report-envelope.ts`.
2. Carry `resolution`, `person`, `display_name` and `identities` on the row, in the envelope's snake_case convention.
3. Raise `cost_report_version` and record why in the version comment, the same way the previous bumps are recorded.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | Two identifiers one person declared produce one row, not two                                            |
| 1    | Two identifiers nobody declared produce two rows, never one merged bucket                               |
| 1    | Records carrying no identifier land in a row distinct from every unresolved one                         |
| 2    | Every person row lists the identifiers behind it, and a mapped row lists its canonical one among them   |
| 2    | Summing every person row's totals equals the report's own total                                         |
| 3    | An envelope built with no mapping carries every identifier as unresolved, with the figures unchanged    |
| 3    | The envelope's report version is higher than before, and the reason is written beside it                |
