---
objective: "Adding an AI tool that forgets a parallel list fails a test with an actionable message, instead of silently misbehaving at runtime."
status: implemented
---

# Plan: Epic E9 — make the AiTool contract verifiable

## Overview

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| **Goal**   | A conformance test that iterates the tool registry and fails when a registered tool is missing from any list the codebase derives behavior from. |
| **Source** | `epic-E9-aitool-contract-verifiable.md` (SPIKE-E9-01, US-E9-02, US-E9-03, US-E9-04) — the original stated goal of this whole session. |

## Phases

| #   | Phase                    | File                          |
| --- | -------------------------- | ------------------------------ |
| 1   | Registry conformance test  | [`phase-1.md`](./phase-1.md) |

Spike output: [`spike-findings.md`](./spike-findings.md) (SPIKE-E9-01, done).

## Decisions

| Decision | Why |
| -------- | --- |
| **US-E9-02 and US-E9-03 are deliberately scope-reduced** from "derive the probe tables / adapter dispatch from the tool contract" to "cover them with the conformance test." Stated here explicitly rather than silently reinterpreted — user-confirmed before planning. | The spike found `PluginFormat` ("a native on-disk layout aidd can *read*") and `AiToolId` ("a tool aidd installs *into*") are distinct concepts that merely coincide in membership today. Deriving one from the other would couple them permanently, force a function reference (each format's parser) into a contract that is otherwise pure data, and touch all 5 tool files plus `PluginsCapability` — for a guarantee the test delivers with zero production change. Same pattern the review of #514 just validated: keep the literal table where it is, make divergence loud. |
| Assert only invariants that actually hold, verified by probing the live registry first — not invented rules | Probing found opencode is in `MARKETPLACE_PROBES` but **absent** from `PLUGIN_MANIFEST_PROBES` (its plugin mode is flat — no per-plugin manifest directories). A naive "every tool must appear in both probe tables" test would have been wrong. Direction matters: *every probe-table format must be a registered tool* holds universally and catches stale entries; *every tool must have a manifest probe* does not hold and is not asserted. |
| Do not assert `PLUGIN_MANIFEST_PATHS` (`plugin-content-translator.ts`) equals `PLUGIN_MANIFEST_PROBES` | They have **already** diverged (the translator list omits copilot's two paths). Whether that is intentional (translation-time vs detection-time concerns) is unverified. Asserting equality would fail on landing; asserting nothing would hide it. Recorded in the spike findings for separate triage instead. |

## Out of scope, recorded in spike-findings.md

`MARKETPLACE_PROBES`'s copilot entry pointing at a manifest filename; `PLUGIN_MANIFEST_PATHS` divergence; `--help` strings hardcoding the five tool names; `HooksContentFormat` (explicit non-target — legitimately narrower).
