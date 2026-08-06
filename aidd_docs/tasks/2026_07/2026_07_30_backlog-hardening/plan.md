---
objective: "The backlog system reports only real problems, and no rule it enforces exists in two places."
status: implemented
---

# Plan: backlog hardening

## Overview

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| **Goal**   | Remove the false positives and the duplicated rules found in `codex/refactor-pm-backlog` |
| **Source** | Challenge of the worktree, 2026-07-30, findings 1 to 7 plus residual coherence gaps |

## Phases

| #   | Phase                        | File                         |
| --- | ---------------------------- | ---------------------------- |
| 1   | write-time checks stay file-local | [`phase-1.md`](./phase-1.md) |
| 2   | body metadata detection stops guessing | [`phase-2.md`](./phase-2.md) |
| 3   | one home per enforced rule   | [`phase-3.md`](./phase-3.md) |
| 4   | one qualification table      | [`phase-4.md`](./phase-4.md) |
| 5   | state what is not enforced   | [`phase-5.md`](./phase-5.md) |
| 6   | relation and order semantics recoverable | [`phase-6.md`](./phase-6.md) |
| 7   | residual coherence           | [`phase-7.md`](./phase-7.md) |

## Decisions

| Decision                                                                 | Why                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A diagnostic carries its scope; the write-time hook reports only `file` scope | A single write is never a transaction, so graph findings during `07-apply` are noise, not defects. One implementation, two audiences. |
| The checker is the authority for statuses and field ownership; docs are tested against it | The vocabulary lives in six places today. A conformance test is the only thing that keeps them equal. |
| A skill never links outside itself, not even inside its own plugin           | The same tree ships flat and marketplace, and flat renames the skill folder to `<plugin>-<skill>`, so no relative path holds in both. Isolation is what makes a skill portable. |

## Resources

| Source                                             | Verified                                                     |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `plugins/aidd-pm/hooks/check-backlog.js`           | `STATUSES:6`, `FORBIDDEN:23`, `hasBodyMetadata:157`, order key `:532` |
| `plugins/aidd-pm/skills/00-backlog/actions/07-apply.md` | Mutations are delegated one owner at a time, in order, with no transaction boundary |
