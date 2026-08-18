---
status: done
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

### `5)` The cost of finding the run again

Phase 3 finds a session's file by reading and JSON-parsing **every** run file in
the project's directory. `Stop` fires on every turn, so that scan runs on every
turn, and it grows without bound: after a few hundred sessions on one project,
each turn parses a few hundred files. It also shells out to git twice per turn —
`rev-parse` then `remote get-url` — to rebuild a value that cannot change within
a session.

1. Make the lookup O(1) in the number of past sessions. Carrying `vendor_id` in
   the filename is enough: the run stays sortable by its `run_id` prefix, and
   finding it becomes a name match with no file read at all.
2. Do not derive `project_id` twice in one invocation.

> This is the phase that acquires a latency budget, so it is the phase that has
> to stop the growth. A journal whose cost rises with how much you have used it
> is one that gets uninstalled.

### `6)` The latency budget

1. Assert the hook's in-process work stays under 200 ms at p95 over 100
   invocations, against a directory already holding several hundred run files —
   an empty directory would measure nothing.

> Asserted on in-process work, not on process spawn, which is flaky under CI
> load. Spawn latency stays a manual smoke, stated here so it is not written
> twice. The assertion must also fail on a hang rather than wait for one, which
> is what covers `readFileSync(0)` having no timeout.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | `ended_at` advances across turns within one session |
| 1 | A session that produces no commit still yields a complete record |
| 2 | `vendor_field` reads `session.id`, and the value in `vendor_id` matches the `session.id` a live export carries for the same session |
| 3 | The key is present and null on a session that ran subagents |
| 4 | Adding any eleventh key fails the test |
| 4 | No written value is a token count, a cost, a model name or a duration |
| 5 | Finding an existing run reads no run file at all, and one turn shells out to git no more than it did with one session on disk |
| 6 | p95 under 200 ms over 100 invocations, measured against a directory holding several hundred runs |
| 6 | A hook that never returns fails the assertion rather than hanging it |
