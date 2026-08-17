---
status: pending
---

# Instruction: plugin shell and test runner

Part of [`plan.md`](./plan.md).

Make the plugin exist, be installable, and be testable — before it does anything.
The runner comes first because there is none today: `scripts/__tests__/` holds
one file and nothing invokes it, so every phase after this one would ship
untested by default.

## Architecture projection

```txt
plugins/aidd-telemetry/
  ✏️ .claude-plugin/plugin.json   # name, version, description, no skills[]
  ✏️ README.md · CHANGELOG.md

.claude-plugin/marketplace.json   # entry, recommended: false
docs/ARCHITECTURE.md              # plugin-concerns table, bundled-hooks table
README.md                         # hero counts, plugin section
lefthook.yml                      # a pre-commit command that runs node --test
```

## Tasks to do

### `1)` The manifest

1. `plugin.json`: `name: aidd-telemetry`, `version: 0.1.0`, a description naming
   the concern, and **no `skills` array**. This plugin ships hooks only.
2. `README.md` and `CHANGELOG.md` in the shape the other seven plugins use.

### `2)` The marketplace entry

1. Add it to `.claude-plugin/marketplace.json` with `recommended: false`.

> The opt-out for a measurement layer is not installing it. Arriving on the
> curated path by default would make that opt-out meaningless.

### `3)` The architecture record

1. One row in the plugin-concerns table. The concern is measurement — neither
   knowledge production, nor code transformation, nor version control.
2. One row in the bundled-hooks table, left with its `Runs` cell pointing at the
   script phase 2 creates.

### `4)` The counts

1. Run `node scripts/sync-readme-counts.mjs`. The hero count moves from seven
   plugins to eight; the per-plugin skill count regex finds no heading and
   leaves the file alone, which is correct for a plugin with zero skills.

### `5)` The runner

1. A `lefthook.yml` pre-commit command running `node --test scripts/__tests__/`,
   skipping with a notice when node is absent, matching the shape the existing
   commands already use.
2. A placeholder test asserting the manifest parses and declares no skills, so
   the runner is proven to run rather than proven to exist.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1, 2 | `claude plugin install aidd-telemetry@aidd-framework` succeeds against the local marketplace and lists as enabled |
| 2 | The entry carries `recommended: false`; installing the curated set does not pull it in |
| 4 | `node scripts/sync-readme-counts.mjs --check` exits 0 |
| 5 | Deleting an assertion in the placeholder test makes `git commit` fail. A runner that cannot fail is not wired |
