---
objective: "A figure is either right or absent, and the two implementations answer the same — including where the parity suite cannot currently look."
status: pending
---

# Plan: what the review left standing

## Overview

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| **Goal**   | Eight defects an adversarial review found and the fixes did not reach  |
| **Source** | Four review agent reports, each finding re-verified at HEAD by file:line |

## Phases

| #   | Phase                                            | File                         |
| --- | ------------------------------------------------ | ---------------------------- |
| 1   | A turn read while it runs is not the last word   | [`phase-1.md`](./phase-1.md) |
| 2   | An unknown keeps its row and never becomes a zero | [`phase-2.md`](./phase-2.md) |
| 3   | The two implementations answer the same, everywhere | [`phase-3.md`](./phase-3.md) |
| 4   | What one provider's captures cannot settle       | [`phase-4.md`](./phase-4.md) |

Phase 1 is the only one a person can hit today; it goes first. Phase 2 is two latent
violations of the layer's own rule, in the module written to enforce it. Phase 3 is the
divergence the parity suite is blind to by construction. Phase 4 decides rather than fixes,
because the evidence needed is not in this repository.

## Resources

| Source | Verified |
| --- | --- |
| Claude Code's own `/usage`, against one real session of 15,684 billed calls | Output and cache-read agree with this layer within ~3% on a comparable window. `input` and cache-write differ by definition, not by defect — the transcript's `input_tokens` really is 2-3 tokens on a cached call, and a cache write is priced by how long it lives. Recorded in `docs/telemetry-limits.md`. |
| The repo's own captured OpenCode exports | `total == input + output + cache.read + cache.write` exactly, on every message. Every capture carries `providerID: "anthropic"`, so the arithmetic is settled for one provider and unknown for the others. |

## Decisions

| Decision | Why |
| --- | --- |
| A partial record is superseded at read time, never corrected in place | The sink is append-only by design. Correcting a stored line would make the file a mutable database and break the one property every consumer relies on. The `billed_request_id` collapse already merges duplicates on read; a later, strictly more complete record for the same call belongs in the same mechanism. |
| A breakdown that cannot place a record gains a row, never drops it | `bySteps` has `unattributed` and `byProjects` has an unknown row for exactly this reason. A record that leaves a breakdown while staying in the total makes the two disagree with nothing naming why — which is the shape of the bug this layer exists to prevent. |
| An unverifiable arithmetic is declared, not guessed | The OpenCode cache question needs a capture from a provider nobody here uses. Picking whichever interpretation seems likely would produce a figure indistinguishable from a measured one. The tool declares what it cannot supply, the same way Cursor already does. |
