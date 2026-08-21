---
objective: "Every stored record names its tool and, where anything can say so, the step that was running — with the strength of that attribution stated rather than assumed."
status: pending
---

# Plan: Metrics contract

## Overview

| Field      | Value                                                             |
| ---------- | ------------------------------------------------------------------- |
| **Goal**   | A shape a service outside this repository can price and aggregate    |
| **Source** | [`spec.md`](./spec.md), issue #687                                   |

## Phases

| #   | Phase                              | File                         |
| --- | ---------------------------------- | ---------------------------- |
| 1   | A record that names its tool       | [`phase-1.md`](./phase-1.md) |
| 2   | The step, from whichever knows it  | [`phase-2.md`](./phase-2.md) |
| 3   | The contract, written down         | [`phase-3.md`](./phase-3.md) |

## Resources

| Source                                                            | Verified                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| github.com/ai-driven-dev/framework/issues/687#issuecomment-5356995580 | Claude Code's transcript carries `attributionSkill` per assistant message — 2267 attributed messages, 25 distinct skills, across 40 transcripts.  |
| The same measurement, per version                                    | The field arrived around 2.1.220 and is **omitted, never nulled**, when no skill runs. Zero `null` values across twelve versions.                  |
| `aidd telemetry read` on a real session                              | A stored record carries `vendor_field` values of `sessionId`, `session.id` and `session_meta.id` — the route as much as the tool.                  |

## Decisions

| Decision                                                                                   | Why                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tool is a field, never inferred from `vendor_field`                                        | `vendor_field` encodes the route as much as the tool — `sessionId` for a locally-read Claude Code record, `session.id` for the same one exported. A consumer forced to reverse it would get it right until a sixth tool arrived.       |
| Where a tool states the running step itself, that is the source; the journal is the fallback   | Claude Code's own field is exact per message. The journal's is a half-open interval closed by the next marker. Preferring the interval where an exact answer exists would be choosing the weaker fact for symmetry.                    |
| Each attribution says how strong it is, on the record                                          | An attribution the tool stated and one derived from an interval answer differently when two skills interleave. Collapsing them into one field means a consumer cannot tell a measurement from an inference, which is the whole failure mode. |
| An absent step reads as *unattributed*, never as *outside any step*                            | Claude Code omits its field both when no skill ran and when the version predates it, and nothing on the record separates the two. Asserting the stronger reading would invent a fact — exactly what the layer exists to prevent.         |
| The contract is a document, not a type                                                         | A consumer outside this repository cannot import a TypeScript interface. A document is the deliverable; the type is how this side happens to enforce it.                                                                              |
| The stored schema stays at 2; adding fields does not bump it                                   | Version 2 has never been released — no line exists in anyone's hands. A version number tells a consumer what to expect from a line they hold, and bumping for a shape nobody holds would encode this branch's archaeology into a wire format. The bump happens once, at the first release. |
| The export path is not attributed from the journal, contrary to phase 2's first draft         | The mapper runs at receive time, while the journal is still being written — the live turn has no `turn_end` yet, so the last `step_start` reads as an interval with no end and swallows whatever arrives next. Burning a one-shot inference into a stored record from an incomplete file is worse than leaving it unattributed. Raised by the executor against the brief, and correct. |
| A Codex record carries the turn's own start, not a moment inside it                            | Without a moment, no Codex record can fall inside a step interval, so the journal — its only step source — could never reach it. The rollout carries the moment on `turn_context`. A record covers a whole turn, so a moment from a counted event inside it would claim a precision the record does not have. |
| Nothing already stored is rewritten                                                            | Backfilling means re-deriving attributions for records whose source files may have rotated, and a re-derived figure would be indistinguishable from a measured one. Records written from now on carry the new fields; older ones do not. |
