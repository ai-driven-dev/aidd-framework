# Telemetry

What a session cost, measured from files each AI tool already wrote, stored per machine. No process runs to produce it; nothing leaves the machine. Boundary for a hosted destination: [`measurement-may-reach-a-hosted-destination.md`](../../../aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md).

## Sink

- `TelemetrySinkAdapter` (`src/contexts/telemetry/infrastructure/telemetry-sink-adapter.ts`) resolves its root: `AIDD_TELEMETRY_DIR`, else `AIDD_USER_CONFIG_DIR` (legacy, never the variable a team shares), else the default config dir (`.config/aidd` on POSIX and on Windows with pre-existing data, `%APPDATA%/aidd` otherwise).
- One `.jsonl` day file per UTC day under `telemetry/`, append-only, `0600`/`icacls` unless the directory was user-named.
- Two record kinds (`TelemetrySinkRecordKind`, `contexts/telemetry/domain/telemetry-sink-record.ts`): `request`, `session`. Provenance: `export` or `local-read`.

## Run journal

- Written by the plugin hook, not the CLI: `plugins/aidd-telemetry/hooks/journal.cjs` reads stdin, detects the host, dispatches to `hooks/lib/`.
- `record.cjs` mints a run id, appends `session_start`/`turn_end`; `step-starts.cjs`, `step-ends.cjs`, `task-declared.cjs`, `file-writes.cjs` append the rest; `repo.cjs` resolves paths and tightens permissions; `trailer-repair.cjs` backs the commit trailer; `opencode-plugin.js` is OpenCode's own entry.
- Lives at the git root above the project: `kernel/paths.ts`'s `resolvedRunsDir` walks up via `repositoryRootAbove`. `AIDD_RUNS_DIR` overrides, read alike by `hooks/lib/repo.cjs` and the CLI.

## Report

- `aidd telemetry report` renders the axes in `ARTEFACT_AXES` (`src/presentation/display/cost-report-artefact.ts`).
- `--axis <axis>` prints one markdown table; `--json` the envelope. Filters: `--from`, `--to`, `--days`, `--task`, `--project`, `--step`, `--model`, `--tool`.
- Envelope version `cost_report_version` (`COST_REPORT_ENVELOPE_VERSION`, `contexts/telemetry/domain/cost-report-envelope.ts`) bumps when a consumer must tell shapes apart, not per field.

## Attribution

- Person (`contexts/telemetry/domain/person-resolution.ts`): `mapped`, `unresolved`, `this-machine`. Identity is read and written from this machine's profile only; `aidd telemetry identity` never reads `AIDD_USER_CONFIG_DIR` or `.aidd/config.json`.
- Task, step, flow (`task-attribution.ts`, `step-attribution.ts`, `flow-attribution.ts`): declared-vs-inferred over the journal's closed intervals (`journal-intervals.ts`).
- Agent: `TelemetryRouteSupply.agentName` (`kernel/measurement.ts`); only Claude Code's reader sets it (`isSidechain`/`attributionAgent`, `contexts/telemetry/domain/formats/claude-code-transcript.ts`).

## What a tool declares

- `kernel/measurement.ts`'s `TelemetryLocalRead`: `declared` carries `TelemetryRouteSupply` (`tokenCounters`, `amount`, `toolStatedStep`, `agentName`), an optional `TranscriptLocation`, an optional `limitation`; `unsupported` carries a `reason`.
- `telemetry → tools` is the one allowed edge. Along it `telemetry` reuses seven `tools` public modules, listed here only: `registry.ts`, `marketplace-settings.ts`, `host-plugin-registration.ts`, `ports/host-plugin-registry-reader.ts`, and the `plugin-root-token`/`flat-hooks-merge`/`cursor-hooks-project-merge` format helpers. `domain/telemetry-setup.ts` crosses too.
- Declared: `claude`, `codex`, `copilot`, `opencode`, each in `contexts/tools/domain/profiles/<name>/profile.ts`. `unsupported`: `cursor`. Silent: `vscode`.

## Gotchas

- `AIDD_RUNS_DIR` answers where the journal lives; `AIDD_TELEMETRY_DIR`/`AIDD_USER_CONFIG_DIR` where the figures do. `cli.md` lists what else the latter moves. Read `plugins/aidd-telemetry/README.md` ("Share `AIDD_TELEMETRY_DIR`, never `AIDD_USER_CONFIG_DIR`") before pointing anyone at either.
- A relocated `HOME` does not relocate a real `codex` if `CODEX_HOME` is set (`testing.md`).
- A generated `prepare-commit-msg` (lefthook, husky) never calls the delegate until the printed job is added by hand; `on` and `check` name it, neither edits those files.
