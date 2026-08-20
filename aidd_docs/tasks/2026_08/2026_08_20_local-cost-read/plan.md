---
objective: "A session's token counts and model are readable from the files its tool already wrote, normalised into the shape an exported session already lands in, and marked as having come that way."
status: pending
---

# Plan: Local cost read

## Overview

| Field      | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| **Goal**   | Take the counters from the tool's own files, with no process running       |
| **Source** | [`spec.md`](./spec.md), issue #685, decided in #684                       |

## Phases

| #   | Phase                              | File                         |
| --- | ---------------------------------- | ---------------------------- |
| 1   | One shape, whichever route it took | [`phase-1.md`](./phase-1.md) |
| 2   | The two transcript readers         | [`phase-2.md`](./phase-2.md) |
| 3   | The one that answers for itself    | [`phase-3.md`](./phase-3.md) |

## Resources

| Source                                                | Verified                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| github.com/ai-driven-dev/framework/issues/684          | Local reading becomes the default, the receiver becomes opt-in — with the cost stated: a computed amount, and one reader per tool.        |
| github.com/ai-driven-dev/framework/issues/685          | Where each tool's counters live, in what shape, at what granularity. Measured from files on disk, no session run.                         |
| `opencode export <sessionID> --sanitize`, run 2026-08-20 | Answers `{info, messages}` with `messages[].info.tokens`, `modelID` and `providerID` — everything a database query would have found, and a `--sanitize` flag that redacts content at the source. |

## Decisions

| Decision                                                                              | Why                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What is read is normalised into the record an exported session already produces           | Otherwise the reporting deliverable learns two shapes and has to reconcile them, which is where a double count comes from. One shape, one consumer, and a field that says which route it took.                  |
| Provenance is a field on the record, never a separate file or directory                   | A store split by route invites reading one half and calling it the total. A field travels with the figure it qualifies and cannot be dropped by looking in the wrong place.                                     |
| Deduplication keys on the tool's own request identifier, not on a hash of the line        | The same session is read repeatedly by design — the file keeps growing. A provider's request id is stable across reads; a line hash changes the moment the tool appends anything to that record.                |
| Reading is a command, never a hook                                                        | Parsing a transcript on every turn puts file I/O on a session's critical path, which the whole layer exists to stay off. When it runs is a scheduling question with a working default, not part of this.        |
| OpenCode is read by asking the tool, not by opening its database                           | Its counters live in SQLite, which would have meant a native dependency or an engine bump — and a native dependency fails installation for every user, including the four-fifths who never touch OpenCode. `opencode export` returns the same figures over stdout. The tool owns the contract of its own command, which is steadier than its internal schema, and the repository already shells out to tool CLIs elsewhere. |
| No amount is computed here                                                                | None of the readable files carries one. Turning counters into money is #654, and mixing the two would hide which half was measured and which was inferred.                                                      |
| The stored schema version goes to 2, with no migration                                    | Provenance cannot be optional without a default that means "the old route", and the rule against that is the point. Bumping is free precisely once: the sink is delivered but unmerged, so no file exists in anyone's hands. After a release this becomes a migration. |
| Each tool is read at the granularity its own file offers, not at one imposed granularity   | Claude Code counts per assistant message; Codex counts per turn, cumulatively. Forcing either into the other's shape means either inventing detail or discarding it. The stored record already carries a turn identifier, so both fit without a common denominator. |
| No new dependency and no engine floor, for any phase                                       | The CLI is published to npm and its dependencies install on the user's machine. A native dependency needs a prebuild per platform and ABI and otherwise compiles on install, so one tool's feature would break installation for everyone. The shell-out costs a spawn on a path that is never on a session's critical path. |
