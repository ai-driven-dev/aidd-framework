---
objective: "A report answers who spent it, for people who chose to be named, and any dimension filters as well as it groups."
status: pending
---

# Plan: who spent it, and every way to ask

## Overview

| Field      | Value                                                    |
| ---------- | -------------------------------------------------------- |
| **Goal**   | Identity by consent, and filters that compose              |
| **Source** | [`spec.md`](./spec.md), issues #652 #660 #661 #656         |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | Any dimension filters as well as it groups     | [`phase-1.md`](./phase-1.md) |
| 2   | A person can choose to be named, and unchoose  | [`phase-2.md`](./phase-2.md) |
| 3   | A report answers who, for those who chose      | [`phase-3.md`](./phase-3.md) |

Filters first, on purpose. They are worth having without identity, they are provable on data that already exists, and building identity into a report that can only group one way would produce a feature nobody can ask a real question of.

## Resources

| Source | Verified |
| --- | --- |
| `telemetry-report.js` | Filters today are a period and `--task`; `--axis` picks one grouping. Nothing composes. |
| The stored record | Carries tool, model, moment, turn id, step, task, and project with the field that identified it. No identity of any kind. |
| The sink at a hundred sessions over a year | Answers in under 80ms and every breakdown reconciles exactly — the volume a composed filter has to stay usable at. |
| `docs/telemetry-limits.md` | Already states the rule this extends: a figure the layer cannot produce is named as missing, never printed as `0`. |

## Decisions

| Decision | Why |
| --- | --- |
| An identity is never a default | The counterpart of the rule this layer already lives by. A figure with nobody's name is complete; one with a name nobody agreed to give is worse than no figure at all. |
| The person who chooses is the person named | Consent given by a repository, a lead or a CI variable is not consent. It is a choice made on someone's own machine, that they can withdraw. |
| The joining identifier and the display name are separate fields | They are separate decisions. Joining a person's records across their tools needs an identifier they hold; showing a name is a further thing that exists only once asked for. |
| A choice made today does not reach backwards | Records written before an opt-in stay anonymous. Retroactive naming would mean the choice was never real. |
| Filters compose by `and`, and never grow a query language | The moment it needs parentheses it has stopped being a report. Every dimension as filter and as axis covers the questions people actually ask; anything past that is a database. |
| An empty result names the filter that emptied it | Same rule as everywhere here, one dimension further: silence read as a zero is the failure this layer exists to remove. |
