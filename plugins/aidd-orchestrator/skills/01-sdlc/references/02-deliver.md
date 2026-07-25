# 02 - Deliver

Produce a validated candidate from the contract.

```mermaid
---
title: Deliver the candidate
---
flowchart LR
  Contract["$contract"]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  Plan["/aidd-dev:01-plan"]
  PlanArtifact["$plan"]
  Executor(["@aidd-dev:executor"])
  Implement["/aidd-dev:02-implement"]
  Candidate["$candidate"]
  AssertCode["/aidd-dev:03-assert"]
  AssertReport["$assert_report"]
  ArchitectureDecision{"Is architecture documentation available?"}
  AssertArchitecture["/aidd-dev:03-assert"]
  ArchitectureReport["$architecture_report"]
  CommitDecision{"Are there uncommitted changes?"}
  Commit["/aidd-vcs:01-commit"]
  CommitSha["$commit_sha"]
  JourneyDecision{"Is an end-to-end user journey required?"}
  Test["/aidd-dev:06-test"]
  JourneyReport["$journey_report"]
  CandidateSha["$candidate_sha"]
  Check["03 Check"]

  Contract --> Sdlc
  Sdlc --> Plan
  Plan --> PlanArtifact
  PlanArtifact --> Executor
  Executor --> Implement
  Implement --> Candidate
  Candidate -- "Run the assertions." --> AssertCode
  AssertCode --> AssertReport
  AssertReport --> ArchitectureDecision
  ArchitectureDecision -- "Yes, run assert-architecture." --> AssertArchitecture
  AssertArchitecture --> ArchitectureReport
  ArchitectureReport --> CommitDecision
  ArchitectureDecision -- "No, continue." --> CommitDecision
  CommitDecision -- "Yes, commit the candidate." --> Commit
  Commit --> CommitSha
  CommitSha --> JourneyDecision
  CommitDecision -- "No, continue." --> JourneyDecision
  JourneyDecision -- "Yes, run test-journey." --> Test
  Test --> JourneyReport
  JourneyReport --> CandidateSha
  JourneyDecision -- "No, continue." --> CandidateSha
  CandidateSha --> Check

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef agent fill:#F3E8FF,stroke:#9333EA,color:#581C87,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Sdlc,Plan,Implement,AssertCode,AssertArchitecture,Commit,Test skill
  class Executor agent
  class Contract,PlanArtifact,Candidate,AssertReport,ArchitectureReport,CommitSha,JourneyReport,CandidateSha artifact
  class ArchitectureDecision,CommitDecision,JourneyDecision decision
  class Check zone
```

- `/aidd-orchestrator:01-sdlc` owns `$plan`; `@aidd-dev:executor` never rewrites it.
- `@aidd-dev:executor` implements and self-validates. It does not perform the independent review.
- `@aidd-dev:executor` runs `assert-architecture` through `/aidd-dev:03-assert` when architecture documentation applies.
- Run E2E only after implementation, assertions, and commits are complete. A failure re-enters delivery before one final E2E run.
- Return only a clean candidate with green validation to `03-check`.
