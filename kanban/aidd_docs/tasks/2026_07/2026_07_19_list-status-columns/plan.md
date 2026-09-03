---
objective: "Ship fixture-verified frontmatter extraction plus a literal-status column view of aidd_docs task documents, available both as the tool's primary interactive terminal command and as a non-interactive export, with sub-documents nested under their parent without altering its column."
status: reviewed
---

# Plan: cli-kaban — Fixture-Verified Extraction & Status-Column Views

## Overview

| Field      | Value                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Group task documents into columns keyed by their own literal status, in an interactive primary view and a `list` export, with nested sub-documents, backed by fixture-verified extraction |
| **Source** | `./spec.md`                                                                                                     |

## Phases

| #   | Phase                                             | File                         |
| --- | -------------------------------------------------- | ---------------------------- |
| 1   | Domain: task grouping model                        | [`phase-1.md`](./phase-1.md) |
| 2   | Fixture-verified frontmatter extraction             | [`phase-2.md`](./phase-2.md) |
| 3   | Application: grouped, filtered listing              | [`phase-3.md`](./phase-3.md) |
| 4   | Presentation: export command (`list`)              | [`phase-4.md`](./phase-4.md) |
| 5   | Presentation: interactive command (primary)         | [`phase-5.md`](./phase-5.md) |

## Resources

| Source                      | Verified                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| `npm view ink`               | Current version `7.1.1`, peer deps `react`/`@types/react` `>=19.2.0`      |
| `npm view cli-table3`        | Current version `0.6.5`, no peer dependency weight                        |

## Decisions

| Decision                                                                                         | Why                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Infer sub-document membership from directory co-location + filename convention (`plan.md`/`master-plan.md` as parent, falling back to `spec.md` when no plan exists yet; every other markdown file in the same folder is its sub-document) | Frontmatter alone cannot carry this — this repo's own `phase-1.md` has no `type`/`name` field at all — and this is already the convention this framework's own templates follow |
| Reinstate Ink for the interactive view rather than a hand-rolled raw-stdin renderer                 | It was already built and tested in this exact codebase before its removal; hand-rolling terminal/input handling is new, riskier code for no capability this iteration requires (scrolling is a non-goal) |
| Use `cli-table3` for the export's column layout                                                    | Auto-sizes to `process.stdout.columns`, supports multi-line cells for nested sub-document rows, and needs no interactive-rendering dependency for a non-interactive path         |
| Keep the existing `--progress` normalized-bucket filter alongside the new literal-status column key | Nothing in this iteration requires removing it; it stays a useful, orthogonal filter, while the column key itself switches to each document's literal status                    |
| Continue directly on `main`, no feature branch                                                     | The caller merged `feature/list-progress-columns` into `main` and asked to continue there for the rest of this feature                                                        |
