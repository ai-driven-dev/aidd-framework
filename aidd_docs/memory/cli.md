# CLI

The `aidd` binary, built from `cli/` and published to npm as `@ai-driven-dev/cli`.

> `cli/` carries its own `CLAUDE.md` and memory bank. Command detail, interface and internals: [`cli/aidd_docs/memory/cli.md`](../../cli/aidd_docs/memory/cli.md).

## Commands

- Eleven groups: `setup`, `framework`, `translate`, `plugin`, `marketplace`, `auth`, `sync`, `update`, `doctor`, `clean`, `telemetry`.
- No list here. The surface moves; `aidd --help` is the only reading that stays true.
- `telemetry`'s sink, run journal, record shapes, report axes and per-tool declarations: [`cli/aidd_docs/memory/telemetry.md`](../../cli/aidd_docs/memory/telemetry.md).

## Interface

- Node (floor in `architecture.md`'s stack table), ESM, Commander.

## Distribution

Published to npm; the pipeline, its OIDC publishing and its gates are in `deployment.md`.
