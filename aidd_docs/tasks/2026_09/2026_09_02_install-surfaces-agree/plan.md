---
status: planned
backlog: ai-driven-dev/framework#703
spec: ./spec.md
---

# Plan

## The shape, and why it is not a fifth claim

`telemetry-check-display.ts:42` states the rule the report already follows: a setup row is
*"a sentence, never the claims' `ok`/`FAIL`/`--` verdict column — that vocabulary is reserved
for a grade, and nothing here is graded yet."*

The four claims all grade evidence **a run produced**: hook fired, session journalled, tool
files readable, records join. This fact is available **before any session** — that is the
point of it, and the acceptance says so ("no AI session, no network, no money"). So it is a
setup row, and its natural pair is the one directly above it: `recorder declared` answers
*was it declared*, this answers *will the host load it*.

`TelemetryRecorderDeclarationSetup`'s own doc already names this hole:

> A declaration is not proof the hook will fire — see `claude-cli-adapter.ts`'s own measured
> case, where a declared entry is silently dropped as orphaned when a headless run never
> registers the plugin — this fact states only that a declaration was found, never that it
> works.

That paragraph is where the next reader will look, so it is updated in the same commit to
point at the new fact rather than describe an open hole.

## Per tool without naming a tool

The diagnose use-case already takes `readers: ReadonlyMap<AiToolId, SessionCostReader>`. The
same shape carries this: `ReadonlyMap<AiToolId, HostPluginRegistryReader>`. A tool absent
from the map is **unanswerable** — never assumed to agree. Per-tool knowledge lives in
per-tool adapter functions, each carrying its own measurement in a doc comment; the domain
holds no tool name.

## Phases

| # | Does | Touches |
| --- | --- | --- |
| 1 | The model: `TelemetryHostRegistrationSetup`, five answers, on `TelemetrySetup` | `domain/models/telemetry-setup.ts` |
| 2 | The port: `HostPluginRegistryReader`, sibling of `HookTrustReader` | `domain/ports/host-plugin-registry-reader.ts` |
| 3 | The adapter: one reader per measured host, JSON / line-scanned TOML / JSONC | `infrastructure/adapters/host-plugin-registry-reader-adapter.ts` |
| 4 | The comparison: manifest -> `enabledPlugins` -> registry, in the use-case | `use-cases/telemetry/diagnose-telemetry-use-case.ts`, `deps.ts` |
| 5 | The row: `plugins registered`, naming the missing side | `application/display/telemetry-check-display.ts` |
| 6 | The tests, including the seam through `marketplace-sync-settings-use-case.ts` | `cli/tests/**` |

## Test strategy

- **Unit** — the five answers, from evidence shapes. No filesystem.
- **Integration** — each adapter against a written fixture: Claude's JSON, Codex's TOML,
  Copilot's JSONC (written from the recorded shape, never copied from the real file), plus
  absent, unreadable and `enabled = false`.
- **Integration, the seam** — drive `MarketplaceSyncSettingsUseCase` and assert the
  comparison sees what it wrote; this is the file with no test today.
- **E2E** — `aidd telemetry check` in a sandboxed HOME prints the row and names the missing
  side, with no binary on PATH.
