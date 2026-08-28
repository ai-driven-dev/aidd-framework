---
objective: "One file describes a machine's user and every identifier that is them, so resolving a person needs one source of truth instead of two."
status: implemented
---

# Plan: the identity file is the person

## Overview

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| **Goal**   | One declaration, one person, no shape that can express two          |
| **Source** | [`spec.md`](./spec.md); follows the delivery of #661                |

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | The identity carries who is also this person | [`phase-1.md`](./phase-1.md) |
| 2   | One store, one file, one set of verbs        | [`phase-2.md`](./phase-2.md) |
| 3   | The report reads it, and names what stopped it | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision                                                                                   | Why                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The separate declaration file is folded into the identity file, not kept beside it           | Its own justification is false: the source comment says the identity file has two independent writers agreeing byte for byte, but the plain-node writer was deleted when identity moved to the CLI. One writer remains. The reason for two files does not exist.                          |
| The list-of-people shape is deleted, not carried over                                        | A file read from one machine user's own profile can only ever describe that user. A list of people models a roster the design refuses, and it carries a failure — one identifier claimed by two people — that only a hand-edited file can produce. Deleting the shape deletes the failure. |
| How an identity was obtained is stored, as `minted` or `adopted`                             | It is the only checkable fact about an identity, and it is knowable only at the moment of the act. Recorded later it would be a guess; not recorded at all, a taken identity and a created one become indistinguishable.                                                                    |
| No `verified` origin is reserved now                                                         | Nothing can verify an identity without a server. Reserving an enum value for a mechanism that does not exist is the speculative shape this work has already paid for twice.                                                                                                                |
| Withdrawing removes the whole file, added identifiers included                               | With one file there is nothing else to leave standing. It also removes the wart the two-file split forced: a withdrawal that left a declaration behind and had to warn about it.                                                                                                            |
| No migration is written for the old separate file                                            | It was never released. A `status` line naming it when present is honest and costs nothing; migration code would exist for a case that cannot occur in the world.                                                                                                                          |
| An identity file with no origin reads as `minted`; the separate declaration file gets no migration at all | Not an inconsistency: `identity.json` shipped before this branch, written by the plain-node script `38de97d8` deleted, so files without `origin` exist in the world and reading them is reading a real shape. `person-mapping.json` was introduced on this branch and never released, so no such file exists to migrate. One is compatibility, the other would be code for a case that cannot occur. |
| The envelope's failure field changes shape without a second version bump | Verified, not assumed: every consumer of `person_mapping_unusable` is in this repository — the contract doc, the cost skill's own step, the envelope, the artefact, three tests and one fixture — and each is updated by phase 3. Version 4 has never been released, so the number that announces a shape change has never announced this one. |
| The report's flattened failure cause is fixed here rather than left to its own change         | It is the same file and the same read this phase rewrites, and it is a debt of the previous delivery: the contract already required an attribution to state its own strength, and the report path did not.                                                                                  |

## Resources

| Source                                              | Verified                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `git log --diff-filter=D -- .../lib/identity.cjs`   | `38de97d8` deleted the plain-node identity writer; the CLI is the sole writer today    |
| `grep -rn "person_id\|personId" plugins/`           | No plugin code touches the field at all, only prose                                    |
