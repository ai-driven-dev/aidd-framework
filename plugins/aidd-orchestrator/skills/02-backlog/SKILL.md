---
name: 02-backlog
description: Orchestrates a product backlog end to end. Use when the user wants to ask what it holds, or to run intake, triage, refinement, review, lifecycle events, ordering, health checks, or repair. Not for one known artifact step.
argument-hint: ask | create | manage | review | refine
---

# Backlog

```mermaid
flowchart LR
  intent([ask, create, manage, review, or refine]) --> inspect
  inspect -->|"ask"| answer([answer from the read model])
  inspect -->|"create"| triage --> route
  inspect -->|"manage"| route
  inspect -->|"refine"| assess
  inspect -->|"review"| review
  route --> decide
  assess --> decide
  review --> decide
  decide -->|"revise"| route
  decide -->|"no change"| done
  decide -->|"authorize"| apply --> verify
  verify -->|"invalid"| route
  verify -->|"coherent"| done([backlog])
```

## Actions

Run the flow above. Read only the next action file.

| Action  | Does                                        |
| ------- | ------------------------------------------- |
| inspect | resolve the scope, event, and authority   |
| triage  | classify intake and detect existing work    |
| review  | find actionable backlog health improvements |
| route   | delegate proposed artifact changes          |
| assess  | challenge refinement from three viewpoints  |
| decide  | reconcile proposals and confirm authority   |
| apply   | delegate authorized writes                  |
| verify  | prove the resulting graph is coherent       |

## Transversal rules

- Keep product, lifecycle, and backlog decisions with the user.
- Delegate artifact work to its owning capability, resolved by purpose and verified as installed before delegating.
- Store each relation once, in its owning artifact.
- Ask natural questions; never expose internal routes, checks, or unchanged state.
- Change only authorized artifacts and fields.
