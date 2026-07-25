---
name: 01-sdlc
description: Autonomously orchestrates a request from framing to a draft pull request, isolating implementation, independent review, and final outcome challenge. Use when the user wants to deliver a change end to end. Not for running one development step.
---

# Skill: sdlc

## Behavior

Own every routing decision. Verify each handoff against the current reference. Treat canonical addresses as the responsibility map and verify that each provider is installed before calling it. Work autonomously, making reversible in-scope decisions without asking and requesting input only when product authority or external approval is missing. Decide from contract and acceptance criteria, project rules, correctness and security, simplicity, then speed.

Keep planning in the orchestrator, implementation in `@aidd-dev:executor`, and independent judgment in fresh `@aidd-dev:checker` instances. Continue until the branch is clean, every applicable validation is green, the current SHA has passed review and challenge, and a draft pull request exists. Exhaust safe alternatives before returning `blocked`. Route contract gaps to Frame and implementation gaps to Deliver.

```mermaid
---
title: SDLC orchestration
---
flowchart TD
  subgraph FrameStage["01 Frame"]
    direction TB
    Request["$request"]
    Sdlc["/aidd-orchestrator:01-sdlc"]
    Ready{"Are the contract requirements fulfilled?"}
    Frame["01 Frame"]
  end

  subgraph DeliverStage["02 Deliver"]
    direction TB
    Deliver["02 Deliver"]
  end

  subgraph CheckStage["03 Check"]
    direction TB
    Check["03 Check"]
    PullRequest["$pull_request"]
  end

  Request --> Sdlc
  Sdlc --> Ready
  Ready -- "No, frame the contract." --> Frame
  Ready -- "Yes, deliver it." --> Deliver
  Frame --> Deliver
  Deliver --> Check
  Check -- "Ship the candidate." --> PullRequest

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
