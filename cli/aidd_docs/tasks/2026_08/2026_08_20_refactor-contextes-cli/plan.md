---
objective: "cli/src is organised by functional context, each boundary verified by a test rather than a convention, and adding a sixth tool touches one file."
status: in-progress
---

# Plan: Refactor the CLI by functional context

## Overview

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **Goal**   | Move from a layer-first tree to four functional contexts, without changing behavior except where a scope change is declared and reviewed on its own |
| **Source** | `aidd_docs/tasks/2026_08/2026_08_20_refactor-contextes-cli/` — nine scoping documents, every figure measured on the code |

## Phases

| #   | Phase                                       | File                             |
| --- | ------------------------------------------- | -------------------------------- |
| 1   | Extend the golden net                       | [`phase-1.md`](./phase-1.md) |
| 2   | Revive and complete the smoke suite         | [`phase-2.md`](./phase-2.md) |
| 3   | Delete dead code                            | [`phase-3.md`](./phase-3.md) |
| 4   | Drop plugin scaffolding                     | [`phase-4.md`](./phase-4.md) |
| 5   | One build mode per tool                     | [`phase-5.md`](./phase-5.md) |
| 6   | Untangle without moving anything            | [`phase-6.md`](./phase-6.md) |
| 7   | Dissolve the shared dumping ground          | [`phase-7.md`](./phase-7.md) |
| 8   | Put three misplaced units where they belong | [`phase-8.md`](./phase-8.md) |
| 9   | Extract the kernel                          | [`phase-9.md`](./phase-9.md) |
| 10  | Extract the tools context                   | [`phase-10.md`](./phase-10.md) |
| 11  | Extract the translate context               | [`phase-11.md`](./phase-11.md) |
| 12  | Extract the distribution context            | [`phase-12.md`](./phase-12.md) |
| 13  | Extract the framework context               | [`phase-13.md`](./phase-13.md) |
| 14  | Split the Manifest aggregate                | [`phase-14.md`](./phase-14.md) |
| 15  | Drop the manifest version migrations        | [`phase-15.md`](./phase-15.md) |
| 16  | Separate presentation from runtime          | [`phase-16.md`](./phase-16.md) |
| 17  | Turn kanban into a launcher                 | [`phase-17.md`](./phase-17.md) |
| 18  | Move the command surface, by alias          | [`phase-18.md`](./phase-18.md) |
| 19  | Rewrite the documentation and the skills    | [`phase-19.md`](./phase-19.md) |

## Resources

| Source                                                     | Verified                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| https://github.com/obra/superpowers                        | Ten host manifests point at one shared `skills/` folder; no content translation. The comparison is limited: they ship only skills and hooks, the capabilities that converged |
| https://biomejs.dev/linter/rules/no-restricted-imports/     | Stable since 1.6, gitignore-style patterns with negation, custom message, applied per directory through `overrides` |
| https://biomejs.dev/linter/rules/no-import-cycles/          | Detects runtime cycles only. Verified: it flags a deliberate cycle and stays silent on the two found by hand, which close through `import type` |
| ai-driven-dev/framework#592                                 | The roadmap materializes project agents into tool trees, and states that symlinking breaks when formats diverge. Materialization is deliberate |
| ai-driven-dev/framework#465, #468, #464                     | `doctor` reports healthy on a project never set up; four install use-cases and four capability classes duplicate; `status --json` is documented and absent |

## Decisions

| Decision                                                        | Why                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A move and a scope change never share a commit                   | A neutral batch passes golden and e2e untouched; a scope batch recaptures the snapshot and its diff is the review. Without the split, a 22 800-line refactor is unreviewable |
| Translation is the core, framework is one of its clients         | A user on Claude Code can register the marketplace themselves; they cannot convert content into Cursor's `.mdc`, Codex's TOML and Copilot's `.github/instructions` |
| The command surface changes last, through aliases                | The e2e net invokes the CLI. Renaming breaks it exactly when it is most needed |
| A tool is not a managed resource, it is the scope of every command | `ai install cursor` already equips a tool with everything; `tool add` would be the same command twice. `--tool` replaces both groups |
| Two ownership regimes get two treatments                         | Generated files are regenerated; files co-owned with the user are merged. Applying hash tracking to the first is over-engineering, blind rewriting of the second destroys their work |
