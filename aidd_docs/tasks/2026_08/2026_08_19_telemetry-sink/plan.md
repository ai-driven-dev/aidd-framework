---
objective: "Exported telemetry survives the session that produced it, in a format a reader can trust and a shape that never carries an identity nobody asked to collect."
status: pending
---

# Plan: a sink the reader can trust

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | The cost a session emits lands on disk, readable after the process exits, carrying no attribute AIDD did not deliberately keep |
| **Source** | `ai-driven-dev/framework#647` |

## Phases

| #   | Phase                          | File                         |
| --- | ------------------------------ | ---------------------------- |
| 1   | The format, and what never enters it | [`phase-1.md`](./phase-1.md) |
| 2   | The receiver                   | [`phase-2.md`](./phase-2.md) |
| 3   | Retention                      | [`phase-3.md`](./phase-3.md) |
| 4   | The journeys                   | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| The stored shape is specified and versioned before the receiver exists, and phase 1 proves a reader consuming a fixture the receiver never produced | The reader is the customer. Writing the receiver first would make its implementation the specification, and #629 would inherit whatever it happened to emit |
| An **allowlist** of kept attributes, never a denylist of dropped ones | Measured: `user.email` rides on 52 log records out of 52, alongside `user.account_id`, `user.account_uuid`, `organization.id` and `terminal.type`. A denylist leaks every attribute a vendor adds tomorrow; an allowlist drops it |
| `user.id` is kept, every other identity attribute is dropped | It is already an opaque hash, so per-person cost stays possible without storing an address. Resolving one person across tools is #661's job, and it cannot be done at all if identity was never kept |
| The sink is machine-level, under `AIDD_USER_CONFIG_DIR ?? ~/.config/aidd` | One receiver serves every project on the machine, so it cannot live in a repository the way the run journal does. The variable is the CLI's existing convention, used by three call sites, and it is what makes the journeys testable |
| A foreground command, not a supervised daemon | Measured: with nothing listening, a session still completes — 8.3 s without export against 9.3 s to a dead port, one sample each. Nothing needs to guarantee the receiver is up, so nothing needs to supervise it |
| Metrics are stored, not dropped | Measured: `claude_code.active_time.total` is 9.714 s on a real session, and **no log record carries it**. Cost and tokens appear in both streams; active time appears only in metrics. Dropping them would lose the "time" third of what this layer answers |
| The stored line names the vendor field its identity came from | The identity attribute differs per tool — `session.id`, `conversation.id`, `gen_ai.conversation.id`, `cursor.conversation.id` — so a format naming it `session_id` would be Claude's format wearing a neutral label. The run journal already solved this with the same pair |
| `/v1/traces` is accepted even if nothing is stored from it | Copilot's conversation identity lives on a span, not a log. An exporter that receives a 404 retries and then surfaces an error to the user |
| `OTEL_LOG_TOOL_DETAILS` stays off, and redaction is justified differently from the ticket | The ticket says per-step attribution requires the flag. Measured false: the cost record carries `prompt.id` and the hook payload carries `prompt_id`, so a turn joins exactly by identifier. Redaction survives for a stronger reason — the identity attributes above, which arrive whatever the flag does |
