---
objective: "A local report counts one human once across tools and machines, and reports every identity it could not place as unresolved rather than merging or dropping it."
status: in-progress
---

# Plan: resolve one person across tools and machines

## Overview

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| **Goal**   | One human, one row in a local report, with every unplaced identity visible |
| **Source** | [`spec.md`](./spec.md), issue #661                                         |

## Phases

| #   | Phase                                    | File                         |
| --- | ---------------------------------------- | ---------------------------- |
| 1   | The mapping and what resolving means     | [`phase-1.md`](./phase-1.md) |
| 2   | The person breakdown in the report       | [`phase-2.md`](./phase-2.md) |
| 3   | Reading, declaring and rendering it      | [`phase-3.md`](./phase-3.md) |
| 4   | The journeys that prove the guarantees   | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision                                                                                        | Why                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mapping is its own file beside `identity.json`, not a field inside it                        | `identity.json` is a byte shape the plugin's plain-node `identity.cjs` writes and the CLI mirrors field for field. The mapping is read only by the CLI's report path and never by a hook. A new field would put a CLI-only concern into the shared write shape. |
| The mapping resolves from the OS user's profile only, never `AIDD_USER_CONFIG_DIR`               | Same reason `PersonIdentityReader` already refuses it: a repository or a CI job can set that variable, and who a record belongs to is not their choice to make.                                                                                                 |
| Three outcomes, not two: `mapped`, `unresolved`, and `none`                                      | A record carrying an identity nobody mapped and a record carrying no identity at all are different facts. Collapsing them would report "nobody opted in" as "unresolved", which is the same fault the step attribution's three-way shape exists to prevent.      |
| One raw identity claimed by two people is a hard failure, never a pick                           | The spec forbids silently merging a person into another. Choosing between two claimants is exactly that, done quietly.                                                                                                                                         |
| `--axis person` ships here rather than in #656                                                   | #656 is the cross-repository report that depends on upload, redaction and a price table. Without a rendered breakdown, this phase's resolution has no observable output, and the spec's audit condition could not be met at all.                                |
| Turning the identity off leaves the mapping standing, and says so                                | `identity off` means new records carry no person; destroying a person's own declaration of which identifiers are them is not part of that meaning. Silence would be the fault the contract names, so `off` states that the mapping still lists the identifier and names the command that removes it. |
| The mapping's raw identities are opaque strings, and nothing new is captured to fill them        | No per-tool pseudonymous identifier reaches a record today: no `enduser.pseudo.id` anywhere in `cli/src` or the plugin, and the OTLP attribute allowlist excludes every user field. Inventing a capture path here would build against a source that does not exist. |

## Resources

| Source | Verified                                                                                     |
| ------ | -------------------------------------------------------------------------------------------- |
| #661   | Out of scope excludes any hosted directory integration, which places account connection elsewhere |
| #656   | Depends on upload, redaction and a price table, none of which a single machine's report touches   |
