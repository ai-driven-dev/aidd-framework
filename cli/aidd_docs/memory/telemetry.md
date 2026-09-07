# Telemetry

What a session cost, measured from files each AI tool already wrote, stored per machine. No
process runs to produce it and nothing leaves the machine on its own — see the repository's own
[`measurement-may-reach-a-hosted-destination.md`](../../../aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md)
for the boundary that governs a future hosted destination.

## Sink

- `TelemetrySinkAdapter` (`src/contexts/telemetry/infrastructure/telemetry-sink-adapter.ts`)
  resolves its root directory: `AIDD_TELEMETRY_DIR` outright, else `AIDD_USER_CONFIG_DIR`
  (legacy — it also relocates `auth.json`, so it is never the variable a team shares), else the
  default config dir (`.config/aidd` on POSIX and on Windows machines with pre-existing
  telemetry data, `%APPDATA%/aidd` otherwise).
- One `.jsonl` day file per UTC day under `telemetry/`, appended only, `0600`/`icacls`-restricted
  unless the directory was user-named.
- Two record kinds (`contexts/telemetry/domain/telemetry-sink-record.ts`,
  `TelemetrySinkRecordKind`): `request` and `session`. Provenance: `export` or `local-read`.

## Run journal

- Written by the plugin hook, not by this CLI: `plugins/aidd-telemetry/hooks/journal.cjs` reads
  stdin, detects the host, and dispatches to `hooks/lib/` (`record.cjs` mints a run id and
  appends `session_start`/`turn_end` lines; `step-starts.cjs`, `step-ends.cjs`,
  `task-declared.cjs`, `file-writes.cjs` append the rest; `repo.cjs` resolves paths and tightens
  permissions; `trailer-repair.cjs` backs the commit trailer `telemetry on` installs;
  `opencode-plugin.js` is OpenCode's own entry, which does not speak the same hook protocol).
- Lives at the git root **above** the project, never inside it — `kernel/paths.ts`'s
  `resolvedRunsDir` walks up via `repositoryRootAbove` so a session started from a subdirectory
  still finds the one journal at the checkout's root. `AIDD_RUNS_DIR` overrides this outright,
  read the same way by the hook (`hooks/lib/repo.cjs`) and by the CLI's readers.

## Report

- `aidd telemetry report` renders the axes named in `ARTEFACT_AXES`
  (`src/presentation/display/cost-report-artefact.ts`) — read that constant for the current
  list rather than a count here, which decays as axes are added.
- `--axis <axis>` prints one axis as a pasteable markdown table; `--json` prints the envelope
  for a program to parse. Filters: `--from`, `--to`, `--days`, `--task`, `--project`, `--step`,
  `--model`, `--tool`.
- Envelope contract: `cost_report_version` (`contexts/telemetry/domain/cost-report-envelope.ts`,
  `COST_REPORT_ENVELOPE_VERSION`) — bumped when a consumer must be able to tell an old envelope
  shape from a new one, not on every field added.

## Attribution

- Person (`contexts/telemetry/domain/person-resolution.ts`): `mapped` (this machine's own
  identity, `personId` or an `alsoMe` alias), `unresolved` (a real identifier nobody's identity
  covers), or `this-machine` (no identifier on the record, but this machine has declared one).
  Identity is read and written only from this machine's own profile — `aidd telemetry identity`
  never reads `AIDD_USER_CONFIG_DIR` or a project's `.aidd/config.json`.
- Task, step, flow (`contexts/telemetry/domain/task-attribution.ts`, `step-attribution.ts`,
  `flow-attribution.ts`): each a declared-vs-inferred read over the run journal's closed
  intervals (`contexts/telemetry/domain/journal-intervals.ts`) — a flow or a task the journal
  names directly, or one this layer infers from a written file it can place inside an interval.
- Agent: whether a tool's own record states which agent it belongs to
  (`kernel/measurement.ts`'s `TelemetryRouteSupply.agentName`) — only Claude Code's reader sets
  it today (`isSidechain`/`attributionAgent`,
  `contexts/telemetry/domain/formats/claude-code-transcript.ts`).

## What a tool declares

- `kernel/measurement.ts`'s `TelemetryLocalRead` is what a tool profile states about itself: a
  tool declares, a context reads. `declared` carries `TelemetryRouteSupply` (`tokenCounters`,
  `amount`, `toolStatedStep`, `agentName`), an optional `TranscriptLocation`, and an optional
  `limitation`; `unsupported` carries only a `reason`.
- `telemetry → tools` is the one allowed edge (`0-contexts.md`); `tools` never imports
  `telemetry` back. Along it, `telemetry`'s `infrastructure/`/`application/` reuse five of
  `tools`' own public modules — `registry.ts`, `marketplace-settings.ts`, and the
  `plugin-root-token`/`flat-hooks-merge`/`cursor-hooks-project-merge` format helpers — none of
  it measurement-specific, which is why that vocabulary lives in `kernel/measurement.ts`
  instead of in `tools` itself (`architecture.md`).
- Declared: `claude`, `codex`, `copilot`, `opencode` — each in its own
  `contexts/tools/domain/profiles/<name>/profile.ts`. Explicitly `unsupported`: `cursor`.
  Silent, no telemetry field at all: `vscode`.

## Gotchas

- `AIDD_RUNS_DIR` and `AIDD_TELEMETRY_DIR`/`AIDD_USER_CONFIG_DIR` answer different questions —
  where the journal lives versus where the figures do. `AIDD_USER_CONFIG_DIR` moves more than
  telemetry's own root: `auth.json`, the shared `aidd-framework` marketplace registration
  (`marketplaces.json` and its `cache/built/`), the machine's own project-reference
  registry (`references.json`), and the `--scope user` manifest (`manifest.json`) all move
  with it too — see `cli.md`. Read
  `plugins/aidd-telemetry/README.md` ("Share `AIDD_TELEMETRY_DIR`, never
  `AIDD_USER_CONFIG_DIR`") before pointing anyone at either.
- A relocated `HOME` does not relocate a real `codex` binary if `CODEX_HOME` is set on that
  machine — see `testing.md`'s sandboxing gotcha.
