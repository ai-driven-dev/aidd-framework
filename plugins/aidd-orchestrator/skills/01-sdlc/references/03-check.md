# 03 - Check

Review the candidate in a fresh context and route the verdict.

```mermaid
---
title: Check independently
---
flowchart TB
  CandidateSha[["$candidate_sha"]]
  Checker(["@aidd-dev:checker"])
  Review["/aidd-dev:05-review"]
  ReviewArtifact[["$review · $verdict"]]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  Verdict{"Verdict?"}
  Todo["/aidd-dev:10-todo"]
  ExecutorFirst(["@aidd-dev:executor"])
  ExecutorLast(["@aidd-dev:executor"])
  FixFirst[["$fix_a"]]
  FixLast[["$fix_n"]]
  Fixes[["$fixes"]]
  Deliver["02 Deliver"]
  PullRequest["/aidd-vcs:02-pull-request"]
  PullRequestUrl[["$pull_request_url"]]

  CandidateSha --> Checker
  Checker --> Review
  Review --> ReviewArtifact
  ReviewArtifact --> Sdlc
  Sdlc --> Verdict
  Verdict -- "iterate" --> Todo
  Todo --> ExecutorFirst
  Todo --> ExecutorLast
  ExecutorFirst --> FixFirst
  ExecutorLast --> FixLast
  FixFirst --> Fixes
  FixLast --> Fixes
  Fixes --> Deliver
  Verdict -- "ship" --> PullRequest
  PullRequest --> PullRequestUrl

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef agent fill:#F3E8FF,stroke:#9333EA,color:#581C87,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Review,Sdlc,Todo,PullRequest skill
  class Checker,ExecutorFirst,ExecutorLast agent
  class CandidateSha,ReviewArtifact,FixFirst,FixLast,Fixes,PullRequestUrl artifact
  class Verdict decision
  class Deliver zone
```

- `@aidd-dev:checker` is fresh and read-only.
- Any blocking review finding returns `iterate`.
- Dispatch only independent findings through `/aidd-dev:10-todo`, one `@aidd-dev:executor` per finding in parallel.
- Re-enter `02-deliver` to integrate, validate, commit, and run the final E2E gate.
- Only `/aidd-orchestrator:01-sdlc` calls `/aidd-vcs:02-pull-request` after verifying the reviewed SHA.
