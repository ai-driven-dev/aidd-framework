---
objective: "Measurement produces records one way only — reading a tool's own files — with no listener, no egress, a refusal at the person's level, and every shipped sentence about it true."
status: in-progress
---

# Plan: one route, and every sentence about it true

## Overview

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| **Goal**   | Delete the route nobody uses, keep reading what it wrote, tell the truth |
| **Source** | [`spec.md`](./spec.md); the challenge at `../2026_08_28_telemetry-challenge.md` |

## Phases

| #   | Phase                                     | File                         |
| --- | ----------------------------------------- | ---------------------------- |
| 1   | A refusal, and a consent that is asked for | [`phase-1.md`](./phase-1.md) |
| 2   | One route: the writing side goes           | [`phase-2.md`](./phase-2.md) |
| 3   | The diagnostic grades only what exists     | [`phase-3.md`](./phase-3.md) |
| 4   | The sentences become true                  | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision                                                                                     | Why                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The export route's **writing** side is deleted; its **reading** side stays                     | Measured on the machine that built this: 34 stored records, 34 produced by reading a tool's own files, 0 by the export route, 0 carrying an amount. Deleting the writer costs nothing observed. Deleting the reader would lose a stored line someone else may hold, and "an unknown is never a zero" governs data as much as figures. |
| Losing the only amount in currency is accepted, not worked around                              | That route is the only one on any tool that ever carried one. Estimating an amount from token counts to fill the gap would be the exact fault this system exists to prevent. A price table gives an amount for all five tools, without a network, and is separate work. |
| Phase 1 lands before the deletion                                                              | The refusal and the consent are what make measurement legitimate. Shipping them first means that even if the deletion is reverted, the consent story is fixed.                                                                                              |
| The diagnostic drops from six claims to four, and its skill changes in the same commit         | `TelemetryClaimId` is a closed union and `02-check/actions/02-diagnose.md` hard-codes "all six claims" and names both export claims. A shape change whose consumer is not updated in the same commit is how the cost skill was halted by a version pin, twice. |
| A person-level refusal is an environment variable, not a second config file                    | A file at the person's scope would be a fourth place state lives, in a change whose point is that there are too many. An environment variable is refusable per shell, per session and per machine, and needs nothing to be created.                          |
| `telemetry on` is gated the way `endpoint --scope project` already was                         | The two acts have the same consequence — measurement on for everyone who clones — and the sentence naming that consequence is already written in this codebase, on the smaller of the two.                                                                    |

## Resources

| Source                                     | Verified                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `~/.config/aidd/telemetry/*.jsonl`         | 34 records, `provenance` all `local-read`, 0 with `cost_usd`, tools claude 32 / codex 1 / copilot 1 |
| `cli/src/application/errors.ts:83-90`      | The consent sentence phase 1 reuses already exists, on `endpoint --scope project`            |
| `grep telemetryExport\|ExportConfig cli/src` | 14 files touched, concentrated in `telemetry-claim.ts` (17) and the diagnose use case (8)   |
