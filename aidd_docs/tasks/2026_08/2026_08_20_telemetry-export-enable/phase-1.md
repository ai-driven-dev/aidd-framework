---
status: pending
---

# Instruction: the variable set

Part of [`plan.md`](./plan.md).

Pin exactly what `enable` writes, and — just as load-bearing — what it
deliberately does not. This phase produces one constant and its justification;
everything after it is mechanism.

## The block

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "<the endpoint the user gave>",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000",
    "OTEL_RESOURCE_ATTRIBUTES": "aidd.project_id=<owner/repo>"
  }
}
```

## Tasks to do

### `1)` Logs, not only metrics

1. Set `OTEL_LOGS_EXPORTER`, not just `OTEL_METRICS_EXPORTER`.

> Measured: per-session totals live on metrics, but **per-step cost does not**.
> Third-party plugin skill names are replaced with `third-party` on metric
> attributes, so every AIDD skill collapses into one bucket there. Only the
> `skill_activated` **event** carries the real name. A metrics-only export can
> answer "what did this session cost" and can never answer "what did the
> specification step cost", which is the question the layer exists for.

### `2)` A short export interval

1. `OTEL_METRIC_EXPORT_INTERVAL` well under the 60 s default.

> No flush on exit is documented. At the default, a session shorter than a
> minute can end having exported nothing, and short sessions are exactly the
> out-of-flow work the journal is careful to count.

### `3)` `project_id`, by the same rule as the journal

1. Put `aidd.project_id` into `OTEL_RESOURCE_ATTRIBUTES`, derived from
   `git remote get-url origin` as `owner/repo`, falling back to the repository
   root's basename.

> This is the contract with #620, and the reason it matters is that it cannot be
> repaired afterwards: a sink receiving several repositories from one machine has
> nothing else to separate them by. Derived on both sides by the same rule, never
> stored, so there is no second writer to drift.

### `4)` What is deliberately not written

1. **`OTEL_LOG_TOOL_DETAILS` is not set.** State it in the command's output, not
   only in a document.

> It is what makes `skill_activated` carry the real skill name — so per-step cost
> appears to depend on it. But it is not selective: it also logs Bash commands,
> MCP tool names and tool inputs. There is no setting that buys the skill name
> without the command line.
>
> #663 is the answer: the framework emits its own step boundaries, which removes
> the need for the flag entirely rather than trading privacy for it. Until #663
> lands, per-step cost is unavailable — and saying so is better than shipping a
> flag whose full effect a user learns later.

2. No endpoint default. The command asks or fails; it never guesses a host.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | The written block sets both exporters, asserted as an exact key set |
| 2 | The interval is present and below 60000 |
| 3 | `aidd.project_id` matches what the journal writes for the same repository, asserted against the journal's own derivation rather than a copied literal |
| 3 | A repository with no remote still yields a value, keyed on its basename |
| 4 | `OTEL_LOG_TOOL_DETAILS` appears nowhere in what is written |
| 4 | Running `enable` prints that per-step cost needs #663 and that no tool details are logged |
