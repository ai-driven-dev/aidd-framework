# Review: a sink the reader can trust

- **Verdict**: approve
- **Diff**: `HEAD...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_08_19
- **Findings**: 0 critical, 0 warning, 0 minor — three criticals and six others were raised and fixed in this pass

## Phases

### Phase 1 — The format, and what never enters it

- [x] A line names both the identity and the vendor field it came from — `cli/src/domain/models/telemetry-sink-record.ts:174`
- [x] An unknown `sink_schema_version` is rejected rather than guessed — `cli/src/domain/models/telemetry-sink-record.ts:318`
- [x] Every AI tool declares its export attribute names, or declares them unmeasured — `cli/tests/domain/tools/registry-conformance.unit.test.ts:133`, all five asserted by value
- [x] The mapper contains no tool identifier; a second tool maps with no new branch — `cli/tests/domain/models/telemetry-sink-record.unit.test.ts:140`, a Codex-shaped payload maps today
- [x] Active time reaches a stored line from a captured metrics payload — asserts the value, `9.714`
- [x] A session-level line is distinguishable from a per-turn line — `kind` is `session` or `request`
- [x] Every allowlisted field survives a real captured payload — `agent_name` now proven against a second real capture, `otlp-logs-claude-code-subagent.json`
- [x] Each named identity attribute is absent from the output — all seven asserted by name
- [x] An attribute absent from the allowlist is dropped without the mapper knowing it exists
- [x] A hand-written fixture the mapper never produced parses into the fields a report needs — verified genuinely hand-written: the mapper emits `0.013220099999999999` from the captured double, the fixture carries `0.0132201`

### Phase 2 — The receiver

- [x] A posted payload becomes lines on disk, readable after the receiver exits — `cli/tests/e2e/telemetry-sink.e2e.test.ts:125`, read by a separate process
- [x] The endpoint answers 200 so the exporter does not resend what was stored
- [x] No code path reads a sink file in order to write it again — `appendFile`, `readdir` on names, `rm`; never a content read
- [x] The written path honours `AIDD_USER_CONFIG_DIR`, proven by writing elsewhere entirely
- [x] Two projects exporting to one receiver stay separable by `project_id`
- [x] The resolved path appears before the first byte is written
- [x] A malformed body leaves the receiver up and the file untouched
- [x] An unwritable directory fails at startup with a message naming the path
- [x] A session whose endpoint refuses connections still completes

### Phase 3 — Retention

- [x] Files beyond the window are gone and the window's files remain, on real files
- [x] The default is stated with the measurement it came from — 576 bytes a line, `cli/src/domain/models/telemetry-sink-retention.ts:1`
- [x] A payload arriving during a failed prune is still stored
- [x] The newest file is never a candidate for deletion, whatever the window — enforced by `Math.max(1, …)`, exercised at window `0`
- [x] A sink younger than the window loses nothing

### Phase 4 — The journeys

- [x] Figures survive the receiver's exit, read from disk by a separate process
- [x] No identity attribute beyond `user_id` appears in the stored file
- [x] A billed-nothing session and a never-journaled session are told apart at read time — both sides exercised
- [x] With no receiver, enabling telemetry and running a session both succeed
- [x] The suite passes with `GIT_DIR` exported

## Findings

None.

Raised and fixed during this review:

| Was | Kind | Phase | Issue | What changed |
| --- | ---- | ----- | ----- | ------------ |
| 🔴 | code | 2 | The receiver bound **every interface**, not loopback, while the command printed `http://localhost`. An unauthenticated writable endpoint, reachable from the local network | Bound to `127.0.0.1`; the test fails without it with `expected '::' to be '127.0.0.1'` |
| 🔴 | fit | - | `aidd telemetry on` never said the receiver must run separately. A project could be switched on, export correctly, and store nothing — silently, which is the entire feature failing | One line at the end of the enable report, verified on the built binary |
| 🔴 | functional | 1 | Cursor was declared `kind: "declared"` with an attribute read from documentation, never captured — and a conformance test pinned the guess as fact. The type's own docblock says "never guessed from documentation" | Declared `unmeasured`, with the reason written where the next reader will look |
| 🟡 | code | 2 | No cap on a request body, in a process meant to run unattended for months | Refused on `Content-Length`, and the stream cut past 8 MB |
| 🟡 | code | 3 | One undeletable file spared every older one behind it — and stayed the oldest candidate forever, wedging retention for good | Caught per file; a test proves the others are still deleted |
| 🟡 | code | 2 | A client vanishing mid-body settled no promise, leaking the request until process exit | `close` rejects the pending read |
| 🟡 | functional | 1 | `agent_name` was proven only against a hand-written payload claiming real provenance | A second real capture added as a fixture, redacted; the criterion is now met rather than reworded |
| 🟡 | conform | 3 | The prune's `try/catch` breaks `.claude/rules/00-architecture/0-error-handling.md`, which gives no carve-out | The rule gained a narrow one, naming the case. Contorting the code to satisfy a rule written for one-shot commands would have been worse than amending it |
| 🟢 | rot | - | Two identical loops over `AI_TOOL_IDS` differing only in the field collected | One `declaredExports()` the two map over |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (29/29 acceptance criteria) |
| Files checked | `cli/src/domain/models/telemetry-sink-{record,retention}.ts`, `cli/src/domain/ports/telemetry-sink.ts`, `cli/src/infrastructure/adapters/{telemetry-sink,otlp-http-receiver}-adapter.ts`, `cli/src/application/use-cases/telemetry/receive-telemetry-use-case.ts`, `cli/src/application/{commands,display}/telemetry*.ts`, `cli/src/domain/tools/ai/*.ts`, `cli/tests/fixtures/telemetry-sink/*`, and the unit, integration and e2e suites |
| Unchecked     | none |
| Unplanned     | a `TelemetrySink` port and adapter with their doubles — hexagonal plumbing the phase projections omitted rather than scope creep, since a use-case depending on a port cannot exist without one; plus the loopback binding and body cap, which no criterion asked for and the review required |
