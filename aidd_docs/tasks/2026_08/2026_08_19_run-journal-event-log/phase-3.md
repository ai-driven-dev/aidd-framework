---
status: pending
---

# Instruction: the documents

Part of [`plan.md`](./plan.md).

Every place that describes the old record describes the new one. A document that survives a
format change untouched is a document that will be believed.

## Tasks to do

### `1)` The places that describe the record

1. `aidd_docs/runs/README.md`, `plugins/aidd-telemetry/README.md`, `docs/ARCHITECTURE.md`.
2. Each shows the new line shapes, not the old object.

### `2)` Say what changed and why

1. `schema_version: 2` is stated with its reason, so the next reader knows version 1 existed
   and why it did not survive.

### `3)` Leave the previous plans truthful

1. The #620 task folder keeps its history. Add a line stating that its record shape was
   replaced, with a pointer here — do not rewrite it to pretend it always said this.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | No document still shows `tasks[]`, `ended_at` or `parent_run_id` as written fields |
| 1 | `markdown-links` passes |
| 2 | `schema_version: 2` appears with its rationale |
| 3 | The #620 folder points here rather than being edited into agreement |
