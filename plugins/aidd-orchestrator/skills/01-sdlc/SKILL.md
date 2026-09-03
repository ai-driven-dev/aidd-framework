---
name: 01-sdlc
description: Autonomously orchestrates a request from framing to a draft pull request, isolating implementation, independent review, and final outcome challenge. Use when the user wants to deliver a change end to end. Not for running one development step.
argument-hint: request
---

# Skill: sdlc

## Behavior

Operate autonomously from the request to a draft pull request: decide and act without confirmation, asking only before spending money, taking an irreversible action, or making a decision that requires user authority. Read only the current zone reference. Verify that every named provider is installed before calling it.

Spawn specialized agents for isolated work. Parallelize independent work when it is faster. Give each agent one focused task that a smaller model can execute. Repeat the responsible zone when delegated work returns an actionable gap.

```mermaid
---
title: SDLC orchestration
---
flowchart TD
  subgraph FrameStage["01 Frame"]
    direction TB
    Request["$request"]
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

  Request --> Frame
  Frame --> Deliver
  Deliver --> Check
  Check --> PullRequest

  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Request,PullRequest artifact
  class Frame,Deliver,Check zone
```

## References

| #   | Reference                               |
| --- | --------------------------------------- |
| 01  | [Frame](references/01-frame.md)         |
| 02  | [Deliver](references/02-deliver.md)     |
| 03  | [Check](references/03-check.md)         |
