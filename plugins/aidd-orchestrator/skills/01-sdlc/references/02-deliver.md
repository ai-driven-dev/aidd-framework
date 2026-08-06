# 02 - Deliver

## Behavior

Turn the contract into a proportional plan, then give one executor the plan. The executor implements it and calls the validation skills, which own their checks and repair loops. Include architecture conformance whenever the project documents architecture. Run a required end-to-end journey after every other validation.

Commit and push the validated work through the commit skill. Send only the clean committed candidate to Check.

```mermaid
---
title: Deliver the candidate
---
flowchart TD
  subgraph PlanStage["Plan the delivery"]
    direction TB
    Contract["$contract"]
    Plan["/aidd-dev:01-plan"]
    PlanArtifact["$plan"]
  end

  subgraph ExecuteStage["Execute and validate the plan"]
    direction TB
    Executor(["@aidd-dev:executor"])
    Implement["/aidd-dev:02-implement"]
    Assert["/aidd-dev:03-assert"]
    Test["/aidd-dev:06-test"]
    Commit["/aidd-vcs:01-commit"]
  end

  subgraph HandoffStage["Hand off the candidate"]
    direction TB
    CommittedCandidate["$committed_candidate"]
    Check["03 Check"]
  end

  Contract --> Plan
  Plan --> PlanArtifact
  PlanArtifact --> Executor
  Executor --> Implement
  Implement --> Assert
  Assert -- "When no end-to-end journey is required, commit the result." --> Commit
  Assert -- "When an end-to-end journey is required, run it last." --> Test
  Test -- "After the journey succeeds, commit the result." --> Commit
  Test -- "Return a failed journey for repair." --> Executor
  Commit --> CommittedCandidate
  CommittedCandidate --> Check

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef agent fill:#F3E8FF,stroke:#9333EA,color:#581C87,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Plan,Implement,Assert,Test,Commit skill
  class Executor agent
  class Contract,PlanArtifact,CommittedCandidate artifact
  class Check zone
```
