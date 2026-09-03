---
name: resolve-conflict
description: Resolves deterministic Git conflicts or approved choices. Use when the user wants to resolve a merge, rebase, or cherry-pick conflict. Not for deciding between competing implementations or committing changes.
argument-hint: conflict | decision
---

# Resolve Conflict

```mermaid
flowchart LR
  start([active Git conflict]) --> resolve
  resolve -->|no active conflict| none([report no conflict])
  resolve -->|all rows decided| applied([resolve and report])
  resolve -->|approval needed| proposal([propose and stop])
  proposal -->|approved table| resolve
```

## Actions

Read only the next action file.

| Action | Does |
| ------ | ---- |
| resolve | resolve conflicts or propose choices |

## Transversal rules

- Never commit, discard, reset, or check out changes.
- Stage only files resolved by this skill, never unrelated files.
