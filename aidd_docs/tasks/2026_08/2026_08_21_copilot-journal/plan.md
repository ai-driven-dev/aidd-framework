---
objective: "A Copilot session leaves a journal, so its cost can be tied to a step instead of arriving unattributed."
status: pending
---

# Plan: The journal writes on Copilot

## Overview

| Field      | Value                                                                |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | The first of four hosts that record nothing starts recording            |
| **Source** | Issue #681, and milestone 1 of `2026_08_21_clean-v1`                    |

## What is already established

Read from `@github/copilot@1.0.57`'s bundle, in #681:

1. The framework writes its hook keys in PascalCase.
2. Copilot accepts PascalCase as an alias, rewrites it to camelCase, and stamps the entry `_vsCodeCompat`.
3. That stamp selects a different payload builder — `{ hook_event_name, session_id, timestamp, cwd }` instead of `{ sessionId, timestamp, cwd }`.
4. `detectHost` recognises Copilot as *has `sessionId` and has no `hook_event_name`*. A compat payload has neither property.
5. So `detectHost` answers `null`, and nothing is written.

**None of it is confirmed against a payload.** The reasoning is sound and the runtime here reports 1.0.80, whose binary is packed.

## Resources

| Source | Verified |
| --- | --- |
| `~/.copilot/hooks/orca.json` on this machine | Another tool registers Copilot hooks in **PascalCase** — `SessionStart`, `PostToolUse`, `Stop` — and receives payloads. PascalCase hooks do fire on 1.0.80. |
| The same file | Its `subagentStart` key is camelCase while its siblings are not, so both spellings are accepted in one file. Which shape each *delivers* is the open question. |
| `copilot --version` | 1.0.80 is installed here, so the capture costs a prompt rather than an environment. |

## Phases

| #   | Phase                                | File                         |
| --- | ------------------------------------ | ---------------------------- |
| 1   | Capture what Copilot actually sends  | [`phase-1.md`](./phase-1.md) |
| 2   | Recognise the host it really is      | [`phase-2.md`](./phase-2.md) |
| 3   | Prove a session leaves a journal     | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision | Why |
| --- | --- |
| Capture before changing a line | Every claim above comes from reading a bundle two minor versions old. Fixing a detector against a shape nobody has seen would be guessing with extra steps, and a wrong guess here is silent — the journal simply stays empty. |
| Recognise whichever shapes arrive, not the one we prefer | Copilot accepts both spellings in one file, so both payload builders can be reachable. Handling one and assuming the other cannot happen is how this ticket gets reopened. |
| A detector that stops working fails a test, not a user | `detectHost` answering `null` costs nothing visibly: no error, no line, no signal. Only a fixture of the real shape turns that into a failing test. |
| Registering the framework's hooks in camelCase is not the fix | It would avoid the compat path on today's build and depend on a rewrite rule staying as it is. Recognising the payload is true whatever the host decides to send. |
