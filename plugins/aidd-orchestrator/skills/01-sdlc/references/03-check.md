# 03 - Check

## Behavior

Use a fresh checker to review the candidate against the contract, plan, and validation evidence. After a green review, use another fresh checker to challenge the real outcome with the three confidence questions. Both checkers stay read-only.

Route need gaps to Frame. Dispatch independent implementation findings in parallel through Todo, one executor per finding. Keep dependent fixes together. Re-enter Deliver after every fix. If the candidate changed since the review, review it again. Otherwise open the draft pull request.

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
    ReviewChecker(["@aidd-dev:checker"])
    Review["/aidd-dev:05-review"]
    ReviewArtifact["$review"]
    Sdlc["/aidd-orchestrator:01-sdlc"]
    ReviewVerdict{"Are all contract requirements fulfilled?"}
  end

  subgraph ChallengeStage["Challenge the outcome"]
    direction TB
    ConfidenceChecker(["@aidd-dev:checker"])
    Challenge["/aidd-refine:02-challenge"]
    ChallengeFindings["$challenge_findings"]
    Proud{"Am I proud of the work delivered?"}
    Confident{"Am I confident in every consequential choice that was made?"}
    Satisfied{"Will the user be satisfied with the real end-to-end outcome?"}
  end

  subgraph RouteStage["Route the result"]
    direction TB
    ContractGap{"Is the gap in the contract?"}
    Frame["01 Frame"]
    Todo["/aidd-dev:10-todo"]
    ExecutorFirst(["@aidd-dev:executor"])
    ExecutorLast(["@aidd-dev:executor"])
    Fixes["$fixes"]
    Deliver["02 Deliver"]
  end

  subgraph ShipStage["Ship the reviewed candidate"]
    direction TB
    CandidateChanged{"Has the candidate changed since the review?"}
    Check["03 Check"]
    PullRequest["/aidd-vcs:02-pull-request"]
    PullRequestUrl["$pull_request_url"]
  end

  Contract --> ReviewChecker
  Plan --> ReviewChecker
  CommittedCandidate --> ReviewChecker
  ValidationReports --> ReviewChecker
  ReviewChecker --> Review
  Review --> ReviewArtifact
  ReviewArtifact --> Sdlc
  Sdlc --> ReviewVerdict
  ReviewVerdict -- "No, route the findings." --> ContractGap
  ReviewVerdict -- "Yes, challenge the outcome." --> ConfidenceChecker
  ConfidenceChecker --> Challenge
  Challenge --> ChallengeFindings
  ChallengeFindings --> Proud
  Proud -- "Yes, continue." --> Confident
  Confident -- "Yes, continue." --> Satisfied
  Proud -- "No or uncertain, route the findings." --> ContractGap
  Confident -- "No or uncertain, route the findings." --> ContractGap
  Satisfied -- "No or uncertain, route the findings." --> ContractGap
  ContractGap -- "Yes, reframe the contract." --> Frame
  ContractGap -- "No, repair the implementation." --> Todo
  Todo --> ExecutorFirst
  Todo --> ExecutorLast
  ExecutorFirst --> Fixes
  ExecutorLast --> Fixes
  Fixes --> Deliver
  Satisfied -- "Yes, confirm the candidate." --> CandidateChanged
  CandidateChanged -- "Yes, review it again." --> Check
  CandidateChanged -- "No, open the draft pull request." --> PullRequest
  PullRequest --> PullRequestUrl

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef agent fill:#F3E8FF,stroke:#9333EA,color:#581C87,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Review,Sdlc,Challenge,Todo,PullRequest skill
  class ReviewChecker,ConfidenceChecker,ExecutorFirst,ExecutorLast agent
  class Contract,Plan,CommittedCandidate,ValidationReports,ReviewArtifact,ChallengeFindings,Fixes,PullRequestUrl artifact
  class ReviewVerdict,Proud,Confident,Satisfied,ContractGap,CandidateChanged decision
  class Frame,Deliver,Check zone
```
