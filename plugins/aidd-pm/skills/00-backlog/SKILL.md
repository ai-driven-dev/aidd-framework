---
name: 00-backlog
description: Orchestrates product work through a backlog of Epics, User Stories, Tasks, Spikes, and Defects. Use for intake, triage, refinement, review, lifecycle events, ordering, health checks, or end-to-end updates. Not for one known artifact step.
argument-hint: request | artifact | backlog
---

# Backlog

```mermaid
flowchart LR
  source([request, artifact, or backlog]) --> inspect
  inspect -->|"intake"| triage --> route
  inspect -->|"artifact event"| route
  inspect -->|"review"| review --> decide
  route -->|"refinement"| assess --> decide
  route -->|"change"| decide
  decide -->|"revise"| route
  decide -->|"authorize"| apply --> verify
  decide -->|"no change"| done
  verify -->|"invalid"| route
  verify -->|"coherent"| done([backlog])
```

## Actions

Run the flow above. Read only the next action file.

| Action  | Does                                        |
| ------- | ------------------------------------------- |
| inspect | resolve the scope, event, and graph health  |
| triage  | classify intake and detect existing work    |
| review  | find actionable backlog health improvements |
| route   | delegate proposed artifact changes          |
| assess  | challenge refinement from three viewpoints  |
| decide  | reconcile proposals and confirm authority   |
| apply   | delegate authorized writes                  |
| verify  | prove the resulting graph is coherent       |

## Transversal rules

- Keep product, lifecycle, and backlog decisions with the user.
- Delegate artifact work to its owning capability; never copy its rules.
- Spawn only the three leaf reviewers defined by `05-assess`.
- Store each relation once, in its owning artifact.
- Run the backlog checker before and after authorized changes.
- Ask natural questions; never expose internal routes, checks, or unchanged state.
- Change only authorized artifacts and fields.
