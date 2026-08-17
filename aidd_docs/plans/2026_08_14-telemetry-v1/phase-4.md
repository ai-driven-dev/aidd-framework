---
status: pending
---

# Instruction: the record

Part of [`plan.md`](./plan.md).

Ten keys, no eleventh. The set is asserted as a whitelist rather than a minimum,
because the failure this guards against is a future contributor adding a token
count or a model name to a file that gets committed.

## The ten keys

```json
{
  "schema_version": 1,
  "run_id": "01J9X4M2K7QRVB",
  "project_id": "ai-driven-dev/framework",
  "tool": "claude-code",
  "vendor_id": "79041f53-35b0-4924-8855-e43e9de72431",
  "vendor_field": "session.id",
  "parent_run_id": null,
  "started_at": "2026-08-14T10:08:44Z",
  "ended_at": "2026-08-14T11:05:20Z",
  "tasks": []
}
```

`tasks` stays empty until phase 5 fills it.

## Tasks to do

### `1)` Write the eight scalar keys

1. `vendor_id` from the payload field the host detection already identified.
2. `started_at` at `SessionStart`, `ended_at` refreshed on every `Stop`.

### `2)` `vendor_field` names the export-side attribute

1. Write `session.id` on Claude Code — not `session_id`, the hook field the value
   was read from.

> The only consumer is the join in #629, which queries telemetry. Handed the
> hook's field name, a reader has nothing to look the value up by. The hook-side
> name needs no storage: it has already given its value in `vendor_id`.

### `3)` `parent_run_id`, written and always null

1. Write the key. Write `null`. Document that it is null in v1.

> A Claude Code subagent shares its parent's session id and differs only by
> `query_source`, a telemetry attribute no hook ever sees. Omitting the key would
> leave a reader guessing whether the concept exists; writing a fabricated value
> would be worse.

### `4)` The whitelist

1. Assert the written keys are exactly these ten. An extra key fails the test.

> This is the guard on the standing rule. No token, no cost, no model, no
> duration — those change mid-session and are joined after the fact from
> telemetry, never copied into a file that may end up in git.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | `ended_at` advances across turns within one session |
| 1 | A session that produces no commit still yields a complete record |
| 2 | `vendor_field` reads `session.id`, and the value in `vendor_id` matches the `session.id` a live export carries for the same session |
| 3 | The key is present and null on a session that ran subagents |
| 4 | Adding any eleventh key fails the test |
| 4 | No written value is a token count, a cost, a model name or a duration |
