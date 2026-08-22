---
objective: "The journal is never offered to a commit, and where each thing lives is a decision a reader can find."
status: pending
---

# Plan: where measurement lives

## Overview

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| **Goal**   | Private files stay private, and the choice behind them is stated |
| **Source** | [`spec.md`](./spec.md)                                        |

## Phases

| #   | Phase                                          | File                         |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | A journal is never offered to a commit         | [`phase-1.md`](./phase-1.md) |
| 2   | Where each thing lives is a stated choice      | [`phase-2.md`](./phase-2.md) |

## Resources

| Source | Verified |
| --- | --- |
| `post-install-pipeline-use-case.ts:21` | `aidd setup` writes exactly one gitignore entry, `.aidd/cache/`. Nothing covers `aidd_docs/runs/`. |
| A grep across the plugin | It never writes a `.gitignore` either, so no route adds one. |
| This repository's own `.gitignore:47` | `aidd_docs/runs/*` is ignored here, by hand. That is why it was never noticed. |
| `repo.js:143` and `record.js:172` | `0700` on the directory and `0600` on the files, with an explicit `chmod` because `mkdirSync`'s mode only covers a directory it creates. |

## Decisions

| Decision | Why |
| --- | --- |
| The journal stays in the repository, and is ignored there | It records repository-relative paths and task folders; it is a property of that repository. What follows is that it must be ignored, and that is the part nobody drew. |
| The figures stay per user by default | A session's consumption belongs to the person and the machine, not to whichever checkout they were standing in. A team that wants otherwise has a real case, and it becomes a named choice rather than a variable found by reading source. |
| Scope is not exposed uniformly | A journal living outside its repository would describe one repository from outside it, and the first question of any reader would be which one. Symmetry here would cost more than it buys. |
| An existing repository is told, never silently fixed | Someone whose journal is already in git history has a decision to make about that history. Making it for them, quietly, is how a tool loses trust. |
