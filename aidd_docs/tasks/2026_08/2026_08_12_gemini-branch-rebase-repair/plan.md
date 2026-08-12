---
objective: "The rebased gemini branch passes typecheck, lint and the full test suite on top of main, with its repair landed as history that bisects clean."
status: in-progress
---

# Plan: repair the gemini branch after its rebase

## Overview

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| **Goal**   | Realign the `gemini` tool with the exhaustive registry guards main added during the rebase window, then land the fix in history |
| **Source** | [`brainstorm.md`](./brainstorm.md), and the verification run recorded in it                |

## Phases

| #   | Phase                             | File                         |
| --- | --------------------------------- | ---------------------------- |
| 1   | Close the registry conformance gap | [`phase-1.md`](./phase-1.md) |
| 2   | Land the repair in history         | [`phase-2.md`](./phase-2.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| A tool declaring its plugins capability as `mode: "unsupported"` is exempt from the `MARKETPLACE_PROBES` conformance requirement | The guard exists so a tool with a native marketplace stays detectable. `gemini` has no marketplace at all, which is the master plan's binding decision, so the alternative reading of the guard would force a probe entry claiming aidd can detect a gemini marketplace format that does not exist |
| The repair is folded into the commits that introduced each gap, not appended at the branch tip | Both gaps make `aidd framework build --target gemini` unreachable from the commit that opens them, so appending would leave the branch red across most of its own range |
