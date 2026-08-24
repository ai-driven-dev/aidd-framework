---
name: 01-system
description: Manages versioned shared UI system contracts and change deltas. Use when the user wants to map or govern shared interface conventions as explicit AIDD artifacts. Not for feature decisions, project memory, or source implementation.
argument-hint: system request | delta
---

# UI System

```mermaid
flowchart LR
  discover([discover]) --> inspect
  adopt_request([adopt]) --> inspect
  establish_request([establish]) --> inspect
  extend_request([extend]) --> inspect
  retire_request([retire]) --> inspect
  reject_request([reject]) --> inspect
  reconcile_request([reconcile]) --> inspect
  promote_request([promote]) --> inspect
  inspect -->|missing target or scope conflict| stopped([stopped])
  inspect -->|discover| map --> current([system map])
  inspect -->|adopt, establish, extend, or retire| specialize
  specialize -->|adopt concern unresolved| unresolved([unresolved])
  specialize -->|adopt| adopt
  adopt -->|approval missing| unresolved
  adopt -->|lock, id, or scope conflict| stopped
  adopt -->|approved| active([active contract])
  specialize -->|establish| establish
  establish -->|lock, id, or scope conflict| stopped
  establish -->|written| delta([system delta])
  specialize -->|extend| extend
  extend -->|reuse sufficient| reused([reuse decision])
  extend -->|lock or base conflict| stopped
  extend -->|shared gap| delta
  specialize -->|retire| retire
  retire -->|lock or base conflict| stopped
  retire -->|written| delta
  inspect -->|reconcile or reject| reconcile
  inspect -->|promote| reconcile
  reconcile -->|lock conflict| stopped
  reconcile -->|classified, rejected, or not promotable| result([reconciliation result])
  reconcile -->|verified base and promote request| promote
  promote -->|lock, evidence, base, or write conflict| stopped
  promote -->|success| promoted([promoted contract])
```

## Actions

Read only the next action file required by the flow above.

| Action | Does |
| --- | --- |
| inspect | resolve system scope and evidence |
| map | report the current interface system |
| specialize | obtain applicable specialist decisions |
| adopt | record an implemented system |
| establish | authorize a minimum viable system |
| extend | authorize the smallest shared change |
| retire | authorize removal of an active system |
| reconcile | classify contract and implementation drift |
| promote | merge a verified delta into the contract |

## Transversal rules

- Own versioned shared UI system contracts and their change deltas.
- Never modify application source or project memory.
