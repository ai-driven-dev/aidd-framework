---
status: done
---

# Instruction: what Claude Code needs

Part of [`plan.md`](./plan.md).

One tool made to emit, through machinery that already knows how to undo itself.
Claude Code first because its gate is the only one that is nothing — every other
tool adds a lock on top of this same work.

## Do not write a new writer

`.aidd/manifest.json` already records `mergeFiles`: which file, which section,
which entries, per tool. `clean-use-case.ts` already removes exactly those
through `removeEntriesFromJson`. Enabling an export is one more merge entry in
that machinery.

A second writer would give the repository two ways to edit the same file, and
only one of them undoable — which is how a configuration command becomes a
one-way door.

## The block

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "<the endpoint the project declared>",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000",
    "OTEL_RESOURCE_ATTRIBUTES": "aidd.project_id=<owner/repo>"
  }
}
```

## Tasks to do

### `1)` Logs, not only metrics

1. Set `OTEL_LOGS_EXPORTER` as well as `OTEL_METRICS_EXPORTER`.

> Measured: third-party plugin skill names are replaced with `third-party` on
> metric attributes, so every AIDD skill collapses into one bucket there. Only the
> `skill_activated` **event** carries the real name. Metrics alone answer "what
> did this session cost" and can never answer "what did this step cost".

### `2)` A short export interval

1. Well under the 60 s default.

> No flush on exit is documented, so at the default a session shorter than a
> minute can end having exported nothing — and short sessions are exactly the
> out-of-flow work the journal takes care to count.

### `3)` `project_id`, by the journal's rule

1. `aidd.project_id` in `OTEL_RESOURCE_ATTRIBUTES`, from
   `git remote get-url origin` as `owner/repo`, falling back to the root's
   basename.

> Without it a sink receiving several repositories from one machine has nothing
> to separate them by, and it cannot be repaired afterwards. Derived on both
> sides by the same rule, stored on neither, so there is no second writer.

### `4)` What is deliberately not written

1. **`OTEL_LOG_TOOL_DETAILS` is not set**, and the command says so rather than
   leaving it in a document.

> It is what makes `skill_activated` carry the real skill name, so per-step cost
> appears to depend on it. It is not selective: it also logs Bash commands, MCP
> tool names and tool inputs. No setting buys the name without the command line.
>
> #663 removes the need rather than trading privacy for it. Until it lands,
> per-step cost is unavailable — and saying that is better than shipping a flag
> whose full effect a user discovers later.

2. No endpoint default, including localhost. It comes from the switch file or the
   command fails.

### `5)` Leave the seam for the next tool

1. Structure it so Codex is a new function, not an edit to this one, and record
   the one thing whoever writes it must not miss: **`metrics_exporter` defaults to
   `statsig`**, so enabling Codex telemetry without setting that key ships metrics
   to a third party nobody chose.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Both exporters present, asserted as an exact key set |
| 2 | The interval is present and below 60000 |
| 3 | `aidd.project_id` equals what the journal derives for the same repository, asserted against the journal's own function rather than a copied literal |
| 4 | `OTEL_LOG_TOOL_DETAILS` appears nowhere |
| 4 | Enabling prints that per-step cost awaits #663 and that no tool details are logged |
| 5 | Enable then `aidd clean` leaves the settings file byte-identical to before, unrelated keys included |
| 5 | A hand-edited value inside our set is still removed; a key outside it survives |
| 5 | Enabling twice changes nothing the second time |
