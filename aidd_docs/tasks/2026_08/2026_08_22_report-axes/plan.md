---
objective: "A report can be asked along the axis that answers the question, and hands back an artefact suited to it."
status: pending
---

# Plan: a report you can ask along an axis

## Overview

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| **Goal**   | Time and project become answerable, with an artefact    |
| **Source** | [`spec.md`](./spec.md), issues #704 #705                |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | A record knows which project it came from      | [`phase-1.md`](./phase-1.md) |
| 2   | A period breaks down by day and by project     | [`phase-2.md`](./phase-2.md) |
| 3   | A skill asks the question and hands back an artefact | [`phase-3.md`](./phase-3.md) |

Ordered by dependency: nothing can group by a project a record does not name, and no skill can offer an axis the report cannot answer.

## Resources

| Source | Verified |
| --- | --- |
| The stored record's own shape | It carries tool, model, moment, turn id and step. No project, and no identity of any kind. |
| The run journal's `session_start` | It already resolves `project_id` and `project_remote` for the repository the hook fired in, and stops there. |
| `event_timestamp` on every record | The moment the work ran, deliberately distinct from the day file it landed in — a session read a week late still belongs to the day it happened. |
| The sink at a hundred sessions over a year | Answers in under 80ms, and every breakdown reconciles to the total in whole micro-dollars. |

## Decisions

| Decision | Why |
| --- | --- |
| A rendering reads the envelope; it never re-aggregates the sink | Two ways to compute one figure is how a breakdown starts disagreeing with its own total. An artefact is a rendering of an answer, not a second answer. |
| A record that predates the project field belongs to no known project | Attributing it to the repository the reader happens to be standing in would be a guess wearing a figure's clothes, and nobody would see it. |
| A day with no work is a row of zeros, never an omitted row | A gap in a series reads as continuity. This is the same reason an unmeasurable figure is named rather than printed as `0` — except here the zero is true and the silence would be the lie. |
| Person and machine are not in this | They are not a grouping over data we hold. They need an identity nothing records and a decision about what may be recorded about someone; answering that by accident, inside a reporting change, is how it would get answered badly. |
| The skill chooses the axis from the question, not the other way round | Someone asking what last month cost does not know which axis answers them. A menu of flags moves that burden onto the person who came for an answer. |
