# 03 - Check

## Behavior

Use one fresh checker, independent from implementation, to review the candidate against the contract, plan, and validation evidence. After the review clears, the same checker challenges whether the real outcome is trustworthy and serves the user.

Use product or contract findings as the next Frame source. Dispatch independent implementation findings through Todo and keep dependent repairs together in Deliver. Re-enter Check after every new candidate. Open the draft pull request when the checker returns no actionable finding.

```mermaid
---
title: Check and challenge independently
---
flowchart TD
  subgraph ReviewStage["Review independently"]
    direction TB
    Contract["$contract"]
    Plan["$plan"]
    CommittedCandidate["$committed_candidate"]
    ValidationReports["$validation_reports"]
    Checker(["@aidd-dev:checker"])
    Review["/aidd-dev:05-review"]
  end

  subgraph ChallengeStage["Challenge the outcome"]
    direction TB
    Challenge["/aidd-refine:02-challenge"]
  end

  subgraph RouteStage["Route the result"]
    direction TB
    Findings["$findings"]
    Frame["01 Frame"]
    Todo["/aidd-dev:10-todo"]
    Deliver["02 Deliver"]
  end

  subgraph ShipStage["Ship the reviewed candidate"]
    direction TB
    PullRequest["/aidd-vcs:02-pull-request"]
    PullRequestUrl["$pull_request_url"]
  end

  Contract --> Checker
  Plan --> Checker
  CommittedCandidate --> Checker
  ValidationReports --> Checker
  Checker --> Review
  Review -- "Return actionable review findings." --> Findings
  Review -- "When the review clears, challenge the outcome." --> Challenge
  Challenge -- "Return actionable challenge findings." --> Findings
  Challenge -- "When the outcome is trustworthy, open the draft pull request." --> PullRequest
  Findings -- "Use product findings as the next Frame source." --> Frame
  Findings -- "Repair independent implementation findings in parallel." --> Todo
  Findings -- "Repair dependent implementation findings together." --> Deliver
  Todo --> Deliver
  PullRequest --> PullRequestUrl

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef agent fill:#F3E8FF,stroke:#9333EA,color:#581C87,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Review,Challenge,Todo,PullRequest skill
  class Checker agent
  class Contract,Plan,CommittedCandidate,ValidationReports,Findings,PullRequestUrl artifact
  class Frame,Deliver zone
```
