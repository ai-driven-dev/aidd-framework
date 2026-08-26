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
| 1   | `01-cost` calls the CLI                                    | [`phase-1.md`](./phase-1.md) |
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
| The plugin's promise is restated per capability, not per plugin.                        | "No npm install, no CLI, no account" becomes false the moment a skill calls `aidd`. Measuring still needs nothing; answering needs the CLI, and the README has to say which is which.             |
| A skill whose CLI is absent stops and states the reason.                                | The same rule the figures already obey: a missing tool is not an answer of "nothing was measured".                                                                                                |
| Test granularity is decided per phase kind, not uniformly.                              | Where code is **deleted**, one equivalence pin — re-asserting behaviour the CLI suites already own is the duplication this plan removes. Where code is **ported**, one test per distinguishable claim, because the distinction is the product. Where code is **wiring**, the contract, not the wiring. |
| Every phase is confronted once with data the code has never seen.                       | 3,364 green tests found none of the five material defects this layer has had; a 37% loss and a 1% Codex over-count were both found by re-deriving real files. A fixture agrees with the code that produced it — only unseen data can disagree. |
