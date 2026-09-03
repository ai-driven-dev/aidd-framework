---
objective: "One implementation answers what work consumed — the CLI — while plain node keeps writing the journal, and the plugin says which half needs which."
status: pending
---

# Plan: The CLI owns the read path, node keeps the write path

## Overview

| Field      | Value                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Delete the plugin's second implementation of the report and answer through `aidd telemetry`, without slowing or weakening the hooks that record. |
| **Source** | User decision, 2026-08-26: "on va passer par le CLI pour la telemetry, on évite les scripts quand c'est possible", scoped in conversation to the read path after measuring the hook cost. |

## Phases

| #   | Phase                                                     | File                         |
| --- | --------------------------------------------------------- | ---------------------------- |
| 1   | `01-cost` calls the CLI ✅                                  | [`phase-1.md`](./phase-1.md) |
| 2   | `aidd telemetry identity`                                  | [`phase-2.md`](./phase-2.md) |
| 3   | `00-init` calls the CLI                                    | [`phase-3.md`](./phase-3.md) |
| 4   | `aidd telemetry check` — the local claims                  | [`phase-4.md`](./phase-4.md) |
| 5   | `aidd telemetry check` — the export, the trust, the join   | [`phase-5.md`](./phase-5.md) |
| 6   | The promise, and the absent CLI                            | [`phase-6.md`](./phase-6.md) |

## Resources

| Source                                                                 | Verified                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `node hooks/journal.cjs` vs `node cli/dist/cli.js --version`, 10 runs each, 2026-08-26 | 61 ms against 241 ms per call. `PostToolUse` fires on every tool call, so the hooks cannot pay the CLI's start-up. |
| `grep -rhoE 'require\("[^"]+"\)' plugins/aidd-telemetry/hooks`         | Every require under `hooks/` is relative to `hooks/`. Deleting every skill script leaves the write path whole. |
| `cli/src/application/commands/telemetry.ts`                            | `on`, `off`, `read`, `report`, `receive` exist. `identity` and `check` do not.                                |
| `cli/src/infrastructure/adapters/person-identity-adapter.ts`           | Already mirrors `identity.cjs` field for field and path for path, so the identity phase is wiring rather than design.    |

## Decisions

| Decision                                                                              | Why                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The read path moves to the CLI; the write path stays plain node.                       | Measured 61 ms against 241 ms on a hook that fires per tool call. A hook that depends on an installed binary records nothing, silently, when it is missing — and this layer's rule is that an unknown is never a zero. |
| The CLI/plugin parity suite is deleted rather than replaced.                            | It existed only to police a duplication this plan removes. One implementation cannot drift from itself, which is stronger than a guard watching two.                                              |
| The plugin's promise is restated per act, not per plugin.                               | "No npm install, no CLI, no account" becomes false the moment a skill calls `aidd`. And it is three acts, not two halves: **allowing** calls `aidd telemetry on`, **recording** is the hooks under plain `node`, **answering** calls the CLI again. "Measuring needs nothing" reads as though the plugin alone is enough to start, which it is not. |
| A skill whose CLI is absent stops and states the reason.                                | The same rule the figures already obey: a missing tool is not an answer of "nothing was measured".                                                                                                |
| `aidd telemetry on` stops configuring tools; a new `endpoint` verb owns that.            | `on` carried two responsibilities and the group's own description named one. The half that makes tools emit had no name at all, while `receive` — the half that accepts — did. `on` also refused to run without `--endpoint`, so phase 3's "swap the script for `on`" was never a swap: the script writes a local switch and promises nothing leaves the machine. Named `endpoint` rather than `export` because the command configures a destination; the exporting is done later, by the tool. No product doc names `aidd telemetry on` yet, so this costs 3 source files and 6 test files now, and much more after phase 3. |
| `aidd telemetry off` shrinks to the switch alone.                                        | It removes what `on` wrote. Once `on` writes no tool settings, an `off` that still removes them would silently erase an export configuration nobody asked it to touch. |
| Test granularity is decided per phase kind, not uniformly.                              | Where code is **deleted**, one equivalence pin — re-asserting behaviour the CLI suites already own is the duplication this plan removes. Where code is **ported**, one test per distinguishable claim, because the distinction is the product. Where code is **wiring**, the contract, not the wiring. |
| Every phase is confronted once with data the code has never seen.                       | 3,364 green tests found none of the five material defects this layer has had; a 37% loss and a 1% Codex over-count were both found by re-deriving real files. A fixture agrees with the code that produced it — only unseen data can disagree. |
