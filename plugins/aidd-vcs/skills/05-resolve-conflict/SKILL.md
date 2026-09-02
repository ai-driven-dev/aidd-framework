---
name: resolve-conflict
description: Resolves only deterministic Git conflicts and otherwise proposes choices without changing files. Use when the user wants to resolve a merge, rebase, or cherry-pick conflict. Not for deciding between competing implementations or committing changes.
---

# Resolve Conflict

```mermaid
flowchart LR
  start([active Git conflict]) --> resolve
  resolve -->|no active conflict| none([report no conflict])
  resolve -->|all decisions deterministic| applied([resolve and report])
  resolve -->|any decision uncertain| proposal([propose and stop])
```

## Actions

Read only the next action file.

| Action | Does |
| ------ | ---- |
| resolve | resolve safe conflicts or propose a choice |

## Transversal rules

- Never commit, discard, reset, or check out changes.
- Stage only files resolved by this skill, never unrelated files.
