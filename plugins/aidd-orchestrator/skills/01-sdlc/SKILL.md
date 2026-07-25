---
name: 01-sdlc
description: Orchestrates a request from framing to a draft pull request, isolating implementation and review in specialized agents. Use when the user wants to deliver a change end to end. Not for running a single development step.
---

# Skill: sdlc

```mermaid
---
title: SDLC orchestration
---
flowchart LR
  Request[["$request"]]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  Ready{"Contract ready?"}
  Frame["01 Frame"]
  Deliver["02 Deliver"]
  Check["03 Check"]
  PullRequest[["$pull_request"]]

  Request --> Sdlc
  Sdlc --> Ready
  Ready -- "no" --> Frame
  Ready -- "yes" --> Deliver
  Frame --> Deliver
  Deliver --> Check
  Check -- "iterate" --> Deliver
  Check -- "ship" --> PullRequest

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Sdlc skill
  class Request,PullRequest artifact
  class Ready decision
  class Frame,Deliver,Check zone
```

## References

Read only the current zone's reference before delegating it.

| #   | Reference                                      | Does                                  |
| --- | ---------------------------------------------- | ------------------------------------- |
| 01  | [Frame](references/01-frame.md)                | Resolve a planning-ready contract     |
| 02  | [Deliver](references/02-deliver.md)            | Build and validate a committed change |
| 03  | [Check](references/03-check.md)                | Review independently and open the PR  |

## Transversal rules

- Own routing and verify every handoff against the current reference.
- Treat the canonical plugin addresses in the references as the responsibility map. Verify that each named provider is installed before calling it.
- Run planning in the orchestrator context. Isolate implementation in `executor` and independent review in `checker`.
- Mode: default `interactive`, pausing for approval at each step; switch to `auto` only when the caller says so, then decide alone and never ask.
- Stop on `blocked`. Loop `check → deliver` on `iterate`.
