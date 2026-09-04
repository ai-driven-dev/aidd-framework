# CLI

The `aidd` binary, built from `cli/` and published to npm as `@ai-driven-dev/cli`.

> `cli/` carries its own `CLAUDE.md` and memory bank. Command detail, interface and internals: [`cli/aidd_docs/memory/cli.md`](../../cli/aidd_docs/memory/cli.md).

## Commands

- Eleven groups: `setup`, `framework`, `translate`, `plugin`, `marketplace`, `auth`, `sync`, `update`, `doctor`, `clean`, `telemetry`.
- No list here. The surface moves; `aidd --help` is the only reading that stays true.

## Interface

- Node `>=22.12`, ESM, Commander.

## Distribution

npm, through OIDC trusted publishing, no token. `publish-cli` runs when release-please releases the `cli` path.
